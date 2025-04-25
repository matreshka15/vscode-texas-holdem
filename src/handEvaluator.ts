import { Card } from './extension';

export enum HandRank {
    HighCard = 1,
    OnePair,
    TwoPair,
    ThreeOfAKind,
    Straight,
    Flush,
    FullHouse,
    FourOfAKind,
    StraightFlush,
    RoyalFlush
}

export interface HandEvaluation {
    rank: HandRank;
    strength: number; // 牌力评分（0.0 - 1.0）
    description: string; // 牌型描述
}

export class HandEvaluator {
    /**
     * 评估手牌和公共牌的牌力
     * @param hand 玩家手牌
     * @param communityCards 公共牌
     * @returns HandEvaluation 包含牌型和牌力评分
     */
    static evaluateHand(hand: Card[], communityCards: Card[]): HandEvaluation {
        const totalCards = [...hand, ...communityCards];
        const isFlush = this.checkFlush(totalCards);
        const isStraight = this.checkStraight(totalCards);
        const rankCounts = this.countRanks(totalCards);

        if (isFlush && isStraight && this.isRoyal(totalCards)) {
            return { rank: HandRank.RoyalFlush, strength: 1.0, description: '皇家同花顺' };
        }
        if (isFlush && isStraight) {
            return { rank: HandRank.StraightFlush, strength: 0.95, description: '同花顺' };
        }
        if (this.hasNOfAKind(rankCounts, 4)) {
            return { rank: HandRank.FourOfAKind, strength: 0.9, description: '四条' };
        }
        if (this.hasFullHouse(rankCounts)) {
            return { rank: HandRank.FullHouse, strength: 0.85, description: '葫芦' };
        }
        if (isFlush) {
            return { rank: HandRank.Flush, strength: 0.8, description: '同花' };
        }
        if (isStraight) {
            return { rank: HandRank.Straight, strength: 0.75, description: '顺子' };
        }
        if (this.hasNOfAKind(rankCounts, 3)) {
            return { rank: HandRank.ThreeOfAKind, strength: 0.7, description: '三条' };
        }
        if (this.hasTwoPair(rankCounts)) {
            return { rank: HandRank.TwoPair, strength: 0.65, description: '两对' };
        }
        if (this.hasNOfAKind(rankCounts, 2)) {
            return { rank: HandRank.OnePair, strength: 0.6, description: '一对' };
        }

        return { rank: HandRank.HighCard, strength: 0.5, description: '高牌' };
    }

    private static checkFlush(cards: Card[]): boolean {
        const suitCounts: Record<string, number> = {};
        for (const card of cards) {
            suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
        }
        return Object.values(suitCounts).some(count => count >= 5);
    }

    private static checkStraight(cards: Card[]): boolean {
        const ranks = cards.map(card => this.rankToValue(card.rank)).sort((a, b) => a - b);
        const uniqueRanks = Array.from(new Set(ranks));

        for (let i = 0; i <= uniqueRanks.length - 5; i++) {
            if (uniqueRanks[i + 4] - uniqueRanks[i] === 4) {
                return true;
            }
        }

        // 特殊情况：A-2-3-4-5 顺子
        return uniqueRanks.includes(14) && uniqueRanks.slice(0, 4).join(',') === '2,3,4,5';
    }

    private static isRoyal(cards: Card[]): boolean {
        const ranks = cards.map(card => card.rank);
        const royalRanks = ['10', 'J', 'Q', 'K', 'A'];
        return royalRanks.every(rank => ranks.includes(rank));
    }

    private static hasNOfAKind(rankCounts: Record<string, number>, n: number): boolean {
        return Object.values(rankCounts).some(count => count === n);
    }

    private static hasFullHouse(rankCounts: Record<string, number>): boolean {
        const values = Object.values(rankCounts);
        return values.includes(3) && values.includes(2);
    }

    private static hasTwoPair(rankCounts: Record<string, number>): boolean {
        return Object.values(rankCounts).filter(count => count === 2).length >= 2;
    }

    private static countRanks(cards: Card[]): Record<string, number> {
        const rankCounts: Record<string, number> = {};
        for (const card of cards) {
            rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
        }
        return rankCounts;
    }

    private static rankToValue(rank: string): number {
        if (rank === 'A') return 14;
        if (rank === 'K') return 13;
        if (rank === 'Q') return 12;
        if (rank === 'J') return 11;
        return parseInt(rank, 10);
    }
}