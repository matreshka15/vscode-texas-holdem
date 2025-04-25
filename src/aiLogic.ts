import { Card } from './extension';
import { PlayerAction } from './extension'; // 导入 PlayerAction
import { HandEvaluator } from './handEvaluator'; // 引入 HandEvaluator

export interface AIPlayer {
    name: string;
    hand: Card[];
    chips: number;
    isFolded: boolean;
    hasActed: boolean; // 添加 hasActed 属性
    lastAction: PlayerAction | 'allIn' | null;
}

export interface GameState {
    communityCards: Card[];
    currentBet: number;
    pot: number;
}

export class TexasHoldemAI {
    static decideAction(player: AIPlayer, gameState: GameState): 'call' | 'raise' | 'fold' {
        const { hand, chips } = player;
        const { communityCards, currentBet, pot } = gameState;

        // 1. 使用 HandEvaluator 评估牌力
        const evaluation = HandEvaluator.evaluateHand(hand, communityCards);
        const handStrength = evaluation.strength;

        // 2. 计算底池赔率和剩余筹码比例
        const potOdds = currentBet / (pot + currentBet); // 底池赔率
        const chipRatio = chips / (pot + currentBet); // 剩余筹码比例

        // 3. 根据牌力、底池赔率和筹码比例决策
        if (handStrength < 0.3 || chips < currentBet) {
            return 'fold'; // 弃牌：牌力较弱或筹码不足
        } else if (handStrength > 0.7 && chips > currentBet * 2 && pot > 100) {
            return 'raise'; // 加注：牌力较强且筹码充足，且底池较大
        } else if (handStrength > potOdds && chipRatio > 0.5) {
            return 'call'; // 跟注：牌力足够强，且筹码比例较高
        } else {
            return 'fold'; // 弃牌：默认行为
        }
    }
}