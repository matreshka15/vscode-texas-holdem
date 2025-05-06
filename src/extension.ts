import * as vscode from 'vscode';
import { TexasHoldemAI, AIPlayer, GameState } from './aiLogic';
import { HandEvaluator, HandEvaluation } from './handEvaluator'; // 引入 HandEvaluator
import { LogManager } from './logManager'; // 添加导入
import { EventEmitter } from 'events';

// 定义 TreeDataProvider 接口
interface TexasHoldemTreeDataProvider {
    refresh(): void;
    setGameState(state: 'notStarted' | 'inProgress' | 'aiAction' | 'ended'): void; // 添加 setGameState 方法
}

// 定义扑克牌
export class Card {
    constructor(public suit: string, public rank: string) { }

    toString() {
        return `${this.rank}${this.suit}`;
    }
}

class Deck {
    private cards: Card[] = [];

    constructor() {
        this.initializeDeck();
    }

    private initializeDeck() {
        const suits = ['♠', '♥', '♣', '♦'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        for (const suit of suits) {
            for (const rank of ranks) {
                this.cards.push(new Card(suit, rank));
            }
        }
        this.shuffle();
    }

    private shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw(): Card | undefined {
        return this.cards.pop();
    }
}

enum GamePhase {
    PreFlop = '发手牌阶段',
    Flop = '翻牌阶段',
    Turn = '转牌阶段',
    River = '河牌阶段',
    Showdown = '胜负判定阶段'
}

export enum PlayerAction {
    Call = 'call',
    Raise = 'raise',
    Fold = 'fold'
}

// 定义游戏状态
class TexasHoldemGame extends EventEmitter {
    private logProvider: TexasHoldemLogProvider; // 添加 logProvider 属性
    private controlsProvider: TexasHoldemTreeDataProvider; // 添加 controlsProvider 属性
    protected deck: Deck = new Deck();
    protected players: {
        name: string;
        hand: Card[];
        chips: number;
        isFolded: boolean;
        hasActed: boolean;
        lastAction: PlayerAction | 'allIn' | null; // 新增 lastAction 属性
    }[] = [];
    protected communityCards: Card[] = [];
    protected currentPlayerIndex: number = 0; // 当前玩家索引
    protected pot: number = 0; // 奖池
    private currentBet: number = 0; // 当前赌注

    constructor(logProvider: TexasHoldemLogProvider, controlsProvider: TexasHoldemTreeDataProvider) {
        super(); // 调用 EventEmitter 的构造函数
        this.logProvider = logProvider; // 初始化 logProvider
        this.controlsProvider = controlsProvider; // 初始化 controlsProvider
        this.initializePlayers();
    }

    // 动态获取当前赌注
    public getCurrentBet(): number {
        return this.currentBet;
    }

    private initializePlayers() {
        this.players = [
            { name: 'Player', hand: [], chips: 1000, isFolded: false, hasActed: false, lastAction: null },
            { name: 'AI 1', hand: [], chips: 1000, isFolded: false, hasActed: false, lastAction: null },
            { name: 'AI 2', hand: [], chips: 1000, isFolded: false, hasActed: false, lastAction: null },
            { name: 'AI 3', hand: [], chips: 1000, isFolded: false, hasActed: false, lastAction: null }
        ];
    }

    private async dealCardToPlayer(
        player: { name: string; hand: Card[]; chips: number; isFolded: boolean; hasActed: boolean; lastAction: PlayerAction | 'allIn' | null },
        animationProvider: TexasHoldemAnimationProvider
    ) {
        const card = this.deck.draw();
        if (!card) {
            this.logProvider.addLog('牌堆已空，无法继续发牌');
            return;
        }

        // 发牌动画
        const isCurrentPlayer = player.name === 'Player';
        const cardDisplay = isCurrentPlayer ? card.toString() : '??'; // 只有当前玩家能看到正面
        await this.playCardFlyingAnimation(cardDisplay, player.name, animationProvider);

        player.hand.push(card);
        if (isCurrentPlayer) {
            this.logProvider.addLog(`你发到了一张牌: ${card.toString()}`);
        }
    }

    private async playCardFlyingAnimation(cardDisplay: string, playerName: string, animationProvider: TexasHoldemAnimationProvider) {
        const frames: string[] = [];
        const maxFrames = 10; // 动画帧数

        for (let i = 0; i <= maxFrames; i++) {
            const spaces = ' '.repeat(i * 2); // 模拟卡牌移动的空格
            frames.push(`${spaces}[${cardDisplay}] → ${playerName}`);
        }

        for (const frame of frames) {
            animationProvider.setAnimationState([frame]);
            await this.delay(100); // 每帧延迟 100ms
        }

        // 清空动画状态
        animationProvider.clearAnimationState();
    }

    private async playDealerSelectionAnimation(animationProvider: TexasHoldemAnimationProvider): Promise<number> {
        // 打乱玩家顺序
        const shuffledPlayers = this.players.map((player, index) => ({ name: player.name, originalIndex: index }));
        for (let i = shuffledPlayers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledPlayers[i], shuffledPlayers[j]] = [shuffledPlayers[j], shuffledPlayers[i]];
        }

        // 随机生成滚动次数（1到2次）
        const totalCycles = Math.floor(Math.random() * 2) + 1; // 1到2次
        const totalFrames = shuffledPlayers.length * totalCycles; // 总帧数
        const interval = 500; // 每帧间隔时间

        let currentIndex = 0;

        // 动画循环，从上往下滚动
        for (let frame = 0; frame < totalFrames; frame++) {
            const frames: AnimationState = shuffledPlayers.map((player, i) =>
                i === currentIndex ? `> ${player.name} <` : `  ${player.name}`
            );

            animationProvider.setAnimationState(frames);

            await new Promise(resolve => setTimeout(resolve, interval));

            currentIndex = (currentIndex + 1) % shuffledPlayers.length;
        }

        // 随机选择一个最终停留的位置
        const randomStopIndex = Math.floor(Math.random() * shuffledPlayers.length);

        // 闪烁几次以确认庄家
        for (let i = 0; i < 3; i++) {
            const frames: AnimationState = shuffledPlayers.map((player, index) =>
                index === randomStopIndex ? (i % 2 === 0 ? `> ${player.name} <` : `  ${player.name}`) : `  ${player.name}`
            );

            animationProvider.setAnimationState(frames);

            await new Promise(resolve => setTimeout(resolve, interval));
        }

        // 返回庄家在原始玩家数组中的索引
        return shuffledPlayers[randomStopIndex].originalIndex;
    }

    public async startGame(
        treeDataProvider: TexasHoldemTreeDataProvider,
        logProvider: TexasHoldemLogProvider,
        tableProvider: TexasHoldemTableProvider,
        animationProvider: TexasHoldemAnimationProvider
    ) {
        this.resetGame(true);
        // 更新牌桌视图
        this.updateTableViews(treeDataProvider, tableProvider);
        // 播放随机抽取庄家的动画
        const dealerIndex = await this.playDealerSelectionAnimation(animationProvider);

        // 设置小盲注和大盲注
        const smallBlind = 25;
        const bigBlind = 50;

        const smallBlindIndex = (dealerIndex + 1) % this.players.length;
        const bigBlindIndex = (dealerIndex + 2) % this.players.length;

        this.logProvider.addLog(`庄家是: ${this.players[dealerIndex].name}`);
        this.logProvider.addLog(`小盲注: ${this.players[smallBlindIndex].name} (${smallBlind})`);
        this.logProvider.addLog(`大盲注: ${this.players[bigBlindIndex].name} (${bigBlind})`);

        // 扣除小盲注和大盲注
        this.players[smallBlindIndex].chips -= smallBlind;
        this.players[bigBlindIndex].chips -= bigBlind;
        this.pot += smallBlind + bigBlind;

        // 设置当前赌注为大盲注金额
        this.currentBet = bigBlind;

        // 更新牌桌视图
        this.updateTableViews(treeDataProvider, tableProvider);

        // 延迟以便玩家观察当前状态
        await this.delay(500);

        // 发底牌
        await this.dealHoleCards(treeDataProvider, tableProvider, animationProvider);

        // 延迟以便玩家观察底牌
        await this.delay(500);

        // 从大盲位左侧的玩家开始操作
        this.currentPlayerIndex = (bigBlindIndex + 1) % this.players.length;

        // 进入下注阶段
        await this.handleBettingPhase(treeDataProvider, GamePhase.Flop, logProvider, tableProvider);
    }

    private updateTableViews(treeDataProvider: TexasHoldemTreeDataProvider, tableProvider: TexasHoldemTableProvider): void {
        this.notifyGameStateChanged(); // 通知状态变化
        treeDataProvider.refresh();
        tableProvider.refresh(); // 更新牌桌绘制
    }

    private async dealHoleCards(
        treeDataProvider: TexasHoldemTreeDataProvider,
        tableProvider: TexasHoldemTableProvider,
        animationProvider: TexasHoldemAnimationProvider
    ) {
        this.logProvider.addLog('发底牌中...');
        for (let round = 0; round < 2; round++) {
            for (const player of this.players) {
                await this.dealCardToPlayer(player, animationProvider); // 传递 animationProvider
                this.updateTableViews(treeDataProvider, tableProvider); // 使用统一的更新方法
                // 延迟发牌
                await this.delay(500);
            }
        }
    }

    public resetGame(clearCards: boolean = true) {
        this.players.forEach(player => {
            if (clearCards) {
                player.hand = [];
            }
            player.isFolded = false;
            player.hasActed = false;
            player.lastAction = null; // 重置 lastAction
        });
        if (clearCards) {
            this.communityCards = [];
            this.pot = 0;
        }
        this.currentBet = 0; // 重置当前赌注
    }

    private async transitionToPhase(phase: GamePhase, treeDataProvider: TexasHoldemTreeDataProvider, logProvider: TexasHoldemLogProvider, tableProvider: TexasHoldemTableProvider) {
        this.logProvider.addLog(`${phase}开始！`);

        switch (phase) {
            case GamePhase.Flop:
                await this.dealCommunityCards(3, treeDataProvider, tableProvider); // 发三张公共牌
                break;
            case GamePhase.Turn:
                await this.dealCommunityCards(1, treeDataProvider, tableProvider); // 发一张公共牌
                break;
            case GamePhase.River:
                await this.dealCommunityCards(1, treeDataProvider, tableProvider); // 发一张公共牌
                break;
            case GamePhase.Showdown:
                this.determineWinner(); // 判定赢家
                return;
        }

        // 从大盲位左侧的玩家开始操作
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        await this.handleBettingPhase(treeDataProvider, this.getNextPhase(phase), logProvider, tableProvider); // 添加 tableProvider 参数
    }

    // 新增一个辅助方法，用于获取下一个阶段
    private getNextPhase(currentPhase: GamePhase): GamePhase {
        switch (currentPhase) {
            case GamePhase.Flop:
                return GamePhase.Turn;
            case GamePhase.Turn:
                return GamePhase.River;
            case GamePhase.River:
                return GamePhase.Showdown;
            default:
                throw new Error('Invalid game phase');
        }
    }

    private async handleBettingPhase(
        treeDataProvider: TexasHoldemTreeDataProvider,
        nextPhase: GamePhase,
        logProvider: TexasHoldemLogProvider,
        tableProvider: TexasHoldemTableProvider
    ) {
        this.logProvider.addLog('进入下注阶段！');

        // 重置所有玩家的 hasActed 状态
        this.players.forEach(player => {
            player.hasActed = false;
        });

        // 玩家依次操作
        while (!this.allPlayersActed()) {
            const currentPlayer = this.players[this.currentPlayerIndex];
            if (!currentPlayer.hasActed && !currentPlayer.isFolded) {
                if (currentPlayer.name === 'Player') {
                    await this.handlePlayerInput();
                } else {
                    await this.handleAIAction(treeDataProvider, tableProvider);
                }
            }

            // 移动到下一个玩家
            this.moveToNextPlayer();
        }

        if (this.isGameOver()) {
            this.endGame();
        } else {
            await this.transitionToPhase(nextPhase, treeDataProvider, logProvider, tableProvider);
        }

        this.updateTableViews(treeDataProvider, tableProvider); // 统一刷新
    }

    private allPlayersActed(): boolean {
        // 检查所有未弃牌且有筹码的玩家是否完成操作
        return this.players.every(player => player.isFolded || player.chips === 0 || player.hasActed);
    }

    private isGameOver(): boolean {
        const activePlayers = this.players.filter(player => !player.isFolded);
        return activePlayers.length === 1;
    }

    private async handlePlayerInput(): Promise<void> {
        return new Promise<void>(resolve => {
            this.logProvider.addLog('请选择操作');

            // 等待玩家通过侧边栏按钮选择操作
            const checkAction = () => {
                if (this.players[this.currentPlayerIndex].hasActed) {
                    resolve();
                } else {
                    setTimeout(checkAction, 500); // 每隔 500ms 检查一次
                }
            };

            checkAction();
        });
    }

    public async handlePlayerAction(action: PlayerAction | null, treeDataProvider: TexasHoldemTreeDataProvider, tableProvider: TexasHoldemTableProvider) {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.isFolded) return;

        // 处理玩家的操作
        const actionProcessed = this.processAction(currentPlayer, action!);

        if (actionProcessed) {
            // 更新界面和触发后续逻辑
            this.updateTableViews(treeDataProvider, tableProvider); // 使用统一的更新方法
        }
    }

    private processAction(player: { name: string; chips: number; isFolded: boolean; hasActed: boolean; lastAction: PlayerAction | 'allIn' | null }, action: PlayerAction): boolean {
        switch (action) {
            case PlayerAction.Call:
                player.lastAction = player.chips < this.getCurrentBet() ? 'allIn' : PlayerAction.Call;
                return this.handleCall(player);
            case PlayerAction.Raise:
                player.lastAction = PlayerAction.Raise;
                return this.handleRaise(player);
            case PlayerAction.Fold:
                player.lastAction = PlayerAction.Fold;
                return this.handleFold(player);
            default:
                vscode.window.showWarningMessage('未知操作');
                return false;
        }
    }

    private handleCall(player: { name: string; chips: number; hasActed: boolean; lastAction: PlayerAction | 'allIn' | null }): boolean {
        const callAmount = this.getCurrentBet(); // 当前赌注
        const actualCall = Math.min(callAmount, player.chips); // 如果筹码不足，All-in

        if (player.chips < callAmount) {
            this.logProvider.addLog(`${player.name} 选择了 All in (${player.chips})`);
        } else {
            this.logProvider.addLog(`${player.name} 选择了跟注 ${actualCall}`);
        }

        player.chips -= actualCall;
        this.updatePot(actualCall); // 更新奖池
        player.hasActed = true;

        this.notifyGameStateChanged(); // 通知状态变化
        return true;
    }

    private handleRaise(player: { name: string; chips: number; hasActed: boolean; lastAction: PlayerAction | 'allIn' | null }): boolean {
        const raiseAmount = Math.min(this.getCurrentBet() * 2, player.chips); // 使用动态获取的当前赌注
        if (raiseAmount <= this.getCurrentBet()) {
            vscode.window.showWarningMessage(`${player.name} 筹码不足，无法加注`);
            return false;
        }

        player.chips -= raiseAmount;
        this.currentBet = raiseAmount; // 更新当前赌注
        this.updatePot(raiseAmount);
        player.hasActed = true;

        this.notifyGameStateChanged(); // 通知状态变化
        this.logProvider.addLog(`${player.name} 选择了加注 ${raiseAmount}`);
        return true;
    }

    private handleFold(player: { name: string; isFolded: boolean; hasActed: boolean; lastAction: PlayerAction | 'allIn' | null }): boolean {
        player.isFolded = true;
        player.hasActed = true;

        this.notifyGameStateChanged(); // 通知状态变化
        this.logProvider.addLog(`${player.name} 选择了弃牌`);
        return true;
    }

    private updatePot(amount: number): void {
        this.pot += amount;
        this.logProvider.addLog(`奖池增加了 ${amount} 筹码，总奖池为 ${this.pot}`);
    }

    private moveToNextPlayer() {
        const totalPlayers = this.players.length;
        let attempts = 0; // 防止死循环
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % totalPlayers;
            attempts++;
        } while (
            (this.players[this.currentPlayerIndex].isFolded || this.players[this.currentPlayerIndex].chips === 0) &&
            attempts < totalPlayers
        );

        if (attempts >= totalPlayers) {
            vscode.window.showErrorMessage('所有玩家都已弃牌或无法操作');
        }
    }

    private async dealCommunityCards(count: number, treeDataProvider: TexasHoldemTreeDataProvider, tableProvider: TexasHoldemTableProvider) {
        for (let i = 0; i < count; i++) {
            const card = this.deck.draw();
            if (!card) {
                vscode.window.showErrorMessage('牌堆已空，无法继续发牌');
                return;
            }
            this.communityCards.push(card);

            this.updateTableViews(treeDataProvider, tableProvider); // 使用统一的更新方法
            await this.delay(500);
        }
    }

    private determineWinner() {
        const activePlayers = this.players.filter(player => !player.isFolded);

        if (activePlayers.length === 1) {
            // 如果只剩一个玩家未弃牌，直接判定为赢家
            const winner = activePlayers[0];
            winner.chips += this.pot; // 将奖池中的筹码归赢家所有
            this.logProvider.addLog(`${winner.name} 获胜！赢得了奖池 ${this.pot} 筹码！`);
        } else {
            // 使用 HandEvaluator 比较玩家的牌力
            let bestEvaluation: HandEvaluation | null = null;
            const winners: { name: string; hand: Card[]; chips: number; lastAction: PlayerAction | 'allIn' | null }[] = [];

            for (const player of activePlayers) {
                const evaluation = HandEvaluator.evaluateHand(player.hand, this.communityCards);

                if (!bestEvaluation || evaluation.rank > bestEvaluation.rank ||
                    (evaluation.rank === bestEvaluation.rank && evaluation.strength > bestEvaluation.strength)) {
                    // 如果找到更强的牌型，更新最佳牌型并清空赢家列表
                    bestEvaluation = evaluation;
                    winners.length = 0; // 清空赢家列表
                    winners.push(player);
                } else if (evaluation.rank === bestEvaluation.rank && evaluation.strength === bestEvaluation.strength) {
                    // 如果牌型和牌力相同，加入赢家列表
                    winners.push(player);
                }
            }

            if (winners.length === 1) {
                // 单一赢家
                const winner = winners[0];
                winner.chips += this.pot; // 将奖池中的筹码归赢家所有
                this.logProvider.addLog(`${winner.name} 获胜！牌型: ${bestEvaluation!.description}，赢得了奖池 ${this.pot} 筹码！`);
            } else {
                // 平局，平分奖池
                const splitAmount = Math.floor(this.pot / winners.length);
                winners.forEach(winner => {
                    winner.chips += splitAmount;
                    this.logProvider.addLog(`${winner.name} 平局！牌型: ${bestEvaluation!.description}，获得了奖池 ${splitAmount} 筹码！`);
                });

                // 如果有剩余筹码（由于整数除法），将剩余筹码归第一个赢家
                const remainder = this.pot % winners.length;
                if (remainder > 0) {
                    winners[0].chips += remainder;
                    this.logProvider.addLog(`${winners[0].name} 获得了剩余的 ${remainder} 筹码！`);
                }
            }
        }

        this.endGame();
    }

    endGame(): void {
        this.logProvider.addLog('游戏已结束！');
        this.controlsProvider.setGameState('ended'); // 设置按钮状态为游戏结束
    }

    async handleAIAction(treeDataProvider: TexasHoldemTreeDataProvider, tableProvider: TexasHoldemTableProvider) {
        const currentPlayer = this.players[this.currentPlayerIndex] as AIPlayer;
        if (currentPlayer.isFolded || currentPlayer.chips === 0) {
            return;
        }

        const gameState: GameState = {
            communityCards: this.communityCards,
            currentBet: this.getCurrentBet(), // 使用动态获取的当前赌注
            pot: this.pot,
        };

        const action = TexasHoldemAI.decideAction(currentPlayer, gameState);
        this.processAction(currentPlayer, action as PlayerAction);

        // 检查游戏是否结束
        if (this.isGameOver()) {
            this.endGame();
        } else {
            this.logProvider.addLog(`${currentPlayer.name} 选择了 ${action}`);
        }
        this.updateTableViews(treeDataProvider, tableProvider); // 使用统一的更新方法
        await this.delay(800); // 延迟以便观察 AI 行动
    }

    public getCommunityCardsString(): string {
        return this.communityCards.map(card => card.toString()).join(' ') || '暂无公共牌';
    }

    public getPlayerHand(index: number): string {
        return this.players[index].hand.map(card => card.toString()).join(' ') || '暂无手牌';
    }

    public getPlayerStatus(index: number): string {
        const player = this.players[index];
        if (player.isFolded) {
            return '弃牌';
        }
        switch (player.lastAction) {
            case PlayerAction.Call:
                return '跟注';
            case PlayerAction.Raise:
                return '加注';
            case 'allIn':
                return 'All in';
            default:
                return '进行中';
        }
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 添加公共 getter 方法
    public getPlayers() {
        return this.players;
    }

    public getCommunityCards() {
        return this.communityCards;
    }

    public getPot() {
        return this.pot;
    }

    // 在游戏状态变化时触发事件
    private notifyGameStateChanged() {
        this.emit('gameStateChanged');
    }

    public getCurrentPlayer(): { name: string; hand: Card[]; chips: number; isFolded: boolean; hasActed: boolean; lastAction: PlayerAction | 'allIn' | null } {
        return this.players[this.currentPlayerIndex];
    }
}

// 定义按钮视图的 TreeDataProvider
class TexasHoldemControlsProvider implements vscode.TreeDataProvider<vscode.TreeItem>, TexasHoldemTreeDataProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private gameState: 'notStarted' | 'inProgress' | 'aiAction' | 'ended' = 'notStarted';
    private game: TexasHoldemGame; // 添加 game 属性

    constructor(game: TexasHoldemGame) { // 修改构造函数，接收 game 实例
        this.game = game;
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
        switch (this.gameState) {
            case 'notStarted':
                return [
                    this.createCommandItem('发牌', 'extension.startTexasHoldem')
                ];
            case 'inProgress':
                const currentPlayer = this.game.getCurrentPlayer(); // 使用 this.game
                const currentBet = this.game.getCurrentBet();
                const callLabel = currentPlayer.chips < currentBet ? 'All in' : '跟注';
                return [
                    this.createCommandItem(callLabel, 'extension.call'),
                    this.createCommandItem('加注', 'extension.raise'),
                    this.createCommandItem('弃牌', 'extension.fold')
                ];
            case 'ended':
                return [
                    this.createCommandItem('发牌', 'extension.startTexasHoldem'),
                ];
            default:
                return []; // Return an empty array for unexpected states
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setGameState(state: 'notStarted' | 'inProgress' | 'aiAction' | 'ended'): void {
        this.gameState = state;
        this.refresh();
    }

    getGameState(): 'notStarted' | 'inProgress' | 'aiAction' | 'ended' {
        return this.gameState;
    }

    private createCommandItem(label: string, command: string): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        treeItem.command = {
            title: label,
            command: command
        };
        return treeItem;
    }
}

// 定义日志视图的 TreeDataProvider
class TexasHoldemLogProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private logManager: LogManager; // 确保类型正确

    constructor(logManager: LogManager) { // 确保参数类型正确
        this.logManager = logManager;
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
        return this.logManager.getLogs().map((log: string) => new vscode.TreeItem(log, vscode.TreeItemCollapsibleState.None)); // 修复隐式 any
    }

    addLog(message: string): void {
        this.logManager.addLog(message);
        this._onDidChangeTreeData.fire();
    }

    clearLogs(): void {
        this.logManager.clearLogs();
        this._onDidChangeTreeData.fire();
    }
}

// 定义牌桌视图的 TreeDataProvider
// 在 TexasHoldemTableProvider 类中添加一个布尔值属性和方法
class TexasHoldemTableProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private game: TexasHoldemGame;
    private revealAIHands: boolean = false; // 新增属性，默认不显示 AI 玩家手牌

    constructor(game: TexasHoldemGame) {
        this.game = game;
        // 监听游戏状态变化事件
        this.game.on('gameStateChanged', () => {
            this.refresh();
        });
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
        return this.generateTableItems(this.revealAIHands); // 使用 revealAIHands 属性
    }

    // 新增方法，用于设置是否显示 AI 玩家手牌
    public setRevealAIHands(reveal: boolean): void {
        this.revealAIHands = reveal;
        this.refresh(); // 刷新视图
    }

    private generateTableItems(revealAIHands: boolean = false): vscode.TreeItem[] {
        const communityCards = this.game.getCommunityCards();
        const potInfo = `奖池: ${this.game.getPot()} 当前赌注: ${this.game.getCurrentBet()}`;
        const players = this.game.getPlayers();

        // 动态计算框线宽度
        const potBoxWidth = Math.max(15, potInfo.length + 4); // 确保最小宽度为 15，额外加 4 用于边框和空格
        const potRow = ` ${potInfo.padEnd(potBoxWidth - 4, ' ')} `;

        // 绘制公共牌的 ASCII 图形
        const cardAsciiRows = this.generateCardAscii(communityCards);

        // 玩家信息
        const playerItems: vscode.TreeItem[] = [];

        // 处理电脑玩家
        players.forEach((player, index) => {
            if (index !== 0) { // 跳过玩家自己
                const status = this.game.getPlayerStatus(index);
                const playerInfo = `玩家 ${player.name} | 筹码: ${player.chips} | 状态: ${status}`;
                const handDisplay = (revealAIHands)
                    ? player.hand.map(card => `[${card.suit}${card.rank}]`).join(' ') // 显示手牌
                    : player.hand.map(() => '[??]').join(' '); // 隐藏手牌
                playerItems.push(new vscode.TreeItem(`${playerInfo} | 手牌: ${handDisplay}`, vscode.TreeItemCollapsibleState.None));
            }
        });

        // 添加分隔线
        playerItems.push(new vscode.TreeItem(' '.repeat(10), vscode.TreeItemCollapsibleState.None));

        // 处理玩家自己
        const player = players[0];
        const status = this.game.getPlayerStatus(0);
        const playerInfo = `玩家 ${player.name} | 筹码: ${player.chips} | 状态: ${status}`;
        const handAsciiRows = this.generateCardAscii(player.hand);
        handAsciiRows.forEach(row => {
            playerItems.push(new vscode.TreeItem(row, vscode.TreeItemCollapsibleState.None));
        });
        playerItems.push(new vscode.TreeItem(playerInfo, vscode.TreeItemCollapsibleState.None));

        // 将奖池、公共牌和玩家信息组合成 TreeItems
        const potItems = [
            new vscode.TreeItem(potRow, vscode.TreeItemCollapsibleState.None),
            new vscode.TreeItem(' '.repeat(10), vscode.TreeItemCollapsibleState.None) // 添加空白行
        ];

        const communityCardItems = cardAsciiRows.map(row => new vscode.TreeItem(row, vscode.TreeItemCollapsibleState.None));

        return [...potItems, ...communityCardItems, ...playerItems];
    }

    // 生成公共牌的 ASCII 图形
    private generateCardAscii(cards: Card[]): string[] {
        if (cards.length === 0) {
            return [
                '┌──────────────────┐',
                '└──────────────────┘'
            ];
        }

        const cardHeight = 3; // 减少牌的高度

        // 每张牌的 ASCII 图形
        const cardAscii = cards.map(card => {
            const rank = card.rank.padEnd(2, ' '); // 确保 rank 至少占两位
            const suit = card.suit.padStart(2, ' '); // 确保 suit 占两位并靠右对齐
            return [
                '┌───┐',
                `│${suit} ${rank}│`,
                '└───┘',
            ];
        });

        // 将所有牌按行拼接，并在每张牌之间添加一个空格
        const rows: string[] = Array(cardHeight).fill('');
        for (let i = 0; i < cardHeight; i++) {
            rows[i] = cardAscii.map(card => card[i]).join(' '); // 修改为一个空格
        }

        return rows;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
// 定义动画状态类型
type AnimationState = string[]; // 动画状态为字符串数组

class TexasHoldemAnimationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private animationState: AnimationState = []; // 动画状态为字符串数组
    private debugMode: boolean = false; // 调试模式开关

    constructor(debugMode: boolean = false) {
        this.debugMode = debugMode;
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
        // 如果没有动画状态，显示静态页面
        if (this.animationState.length === 0) {
            return [new vscode.TreeItem('...', vscode.TreeItemCollapsibleState.None)];
        }
        return this.animationState.map(line => new vscode.TreeItem(line, vscode.TreeItemCollapsibleState.None));
    }

    setAnimationState(state: AnimationState): void {
        this.updateAnimationState(state, '设置动画状态');
    }

    clearAnimationState(): void {
        this.updateAnimationState([], '清空动画状态');
    }

    private updateAnimationState(state: AnimationState, logMessage: string): void {
        this.animationState = state; // 更新动画状态
        if (this.debugMode) {
            console.log(logMessage, this.animationState); // 调试输出
        }
        this.refresh(); // 通知视图更新
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

// 修改 activate 函数，传递 game 实例
export function activate(context: vscode.ExtensionContext) {
    const logManager = new LogManager();
    const logProvider = new TexasHoldemLogProvider(logManager);

    // 先创建 controlsProvider，但不传递 game
    const controlsProvider = new TexasHoldemControlsProvider(undefined as any); // 使用占位值
    const game = new TexasHoldemGame(logProvider, controlsProvider); // 创建 game 实例

    // 将 game 设置到 controlsProvider 中
    (controlsProvider as any).game = game;

    const animationProvider = new TexasHoldemAnimationProvider();
    const tableProvider = new TexasHoldemTableProvider(game);

    vscode.window.registerTreeDataProvider('texasHoldemControls', controlsProvider);
    vscode.window.registerTreeDataProvider('texasHoldemLogs', logProvider);
    vscode.window.registerTreeDataProvider('texasHoldemTable', tableProvider);
    vscode.window.registerTreeDataProvider('texasHoldemAnimation', animationProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.startTexasHoldem', async () => {
            logProvider.addLog('游戏开始');
            controlsProvider.setGameState('inProgress');
            await game.startGame(controlsProvider, logProvider, tableProvider, animationProvider);
        }),
        vscode.commands.registerCommand('extension.call', async () => {
            logProvider.addLog('玩家选择了跟注');
            await game.handlePlayerAction(PlayerAction.Call, controlsProvider, tableProvider);
        }),
        vscode.commands.registerCommand('extension.raise', async () => {
            logProvider.addLog('玩家选择了加注');
            await game.handlePlayerAction(PlayerAction.Raise, controlsProvider, tableProvider);
        }),
        vscode.commands.registerCommand('extension.fold', async () => {
            logProvider.addLog('玩家选择了弃牌');
            await game.handlePlayerAction(PlayerAction.Fold, controlsProvider, tableProvider);
        }),
        vscode.commands.registerCommand('extension.endTexasHoldem', () => {
            logProvider.addLog('游戏结束');
            game.resetGame(false);
            controlsProvider.setGameState('ended');
            tableProvider.refresh();
        })
    );
}
export function deactivate() { }