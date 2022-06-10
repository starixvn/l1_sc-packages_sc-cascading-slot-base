import { Crons } from "sc-slot-game-base";

export default class CascadingProcessBetQueue extends Crons.SlotProcessBetQueue {
    async generateBetInfo(payload, freeSpinInfo) {
        const betInfo = { ...payload };
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;
        const contributionRate = cascadingSlotsConfig.jackpot ? cascadingSlotsConfig.jackpot.playerContributionRatio : 0;

        betInfo.betMultiplier = cascadingSlotsConfig.betMultiplier;

        if (freeSpinInfo) {
            const { betLevel, coinValue, betMultiplier } = freeSpinInfo;

            betInfo.betLevel = betLevel;
            betInfo.coinValue = coinValue;
            betInfo.betMultiplier = betMultiplier;
        }

        betInfo.amount = betInfo.betLevel * betInfo.coinValue;
        betInfo.totalAmount = parseFloat((betInfo.amount * betInfo.betMultiplier).toFixed(2));
        betInfo.contributionRate = parseFloat(contributionRate.toFixed(4));
        betInfo.contributionAmount = parseFloat((contributionRate * betInfo.totalAmount).toFixed(4));

        return betInfo;
    }

    async upsertBet(player, roundId, bet, rate) {
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;

        const newBet = {
            id: roundId,
            uid: player.UID,
            name: player.profile.name,
            freeBet: bet.freeBet,
            time: new Date(),
            freeSpin: bet.freeSpin,
            betLevel: bet.betLevel,
            coinValue: bet.coinValue,
            bet: bet.amount,
            betMultiplier: bet.betMultiplier,
            totalAmount: bet.totalAmount,
            rate: rate,
            exchangeRateId: this.gameData.exchangeRates.exId,
            odds: {
                oddsByCounts: cascadingSlotsConfig.oddsByCounts,
                freeSpins: cascadingSlotsConfig.freeSpins,
            },
        };

        if (player.session) {
            newBet.memberId = player.session.memberId;
            newBet.siteId = player.session.siteId;
            newBet.partnerId = player.session.partnerId;
            newBet.currency = player.session.currencyName;

            newBet.operatorId = player.session.partnerId;
            newBet.playerId = player.session.memberId;
        }

        await this.roundsRepository.create(newBet);
    }
}
