import { Card } from './extension';
import { PlayerAction,GamePhase } from './extension';
import { HandEvaluator } from './handEvaluator';

export interface AIPlayer {
    name: string;
    hand: Card[];
    chips: number;
    isFolded: boolean;
    hasActed: boolean;
    lastAction: PlayerAction | 'allIn' | null;
}

export interface GameState {
    communityCards: Card[];
    currentBet: number;
    pot: number;
    phase: GamePhase; // 添加游戏阶段
}

export class TexasHoldemAI {
    static decideAction(player: AIPlayer, gameState: GameState): 'call' | 'raise' | 'fold' {
        const { hand, chips } = player;
        const { communityCards, currentBet, pot, phase } = gameState;

        // 1. 使用 HandEvaluator 评估牌力
        const evaluation = HandEvaluator.evaluateHand(hand, communityCards);
        const handStrength = evaluation.strength;

        // 2. 计算底池赔率和剩余筹码比例
        const potOdds = currentBet / (pot + currentBet);
        const chipRatio = chips / (pot + currentBet);

        // 3. 引入随机性和心理博弈
        const bluffChance = Math.random(); // 0 到 1 的随机数
        const isBluffing = bluffChance < 0.1 && phase !== GamePhase.PreFlop; // 10% 概率诈唬，翻牌前不诈唬

        if (isBluffing) {
            return Math.random() > 0.5 ? 'raise' : 'call'; // 随机选择加注或跟注
        }

        // 4. 根据游戏阶段调整策略
        if (phase === GamePhase.PreFlop) {
            if (handStrength > 0.8) {
                return chips > currentBet * 3 ? 'raise' : 'call'; // 强牌加注或跟注
            }
            return chips > currentBet ? 'call' : 'fold'; // 弱牌跟注或弃牌
        }

        // 5. 根据牌力、底池赔率和筹码比例决策
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