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
            newBet.siteId = player.session.siteId;
            newBet.currency = player.session.currencyName;

            newBet.operatorId = player.session.operatorId;
            newBet.playerId = player.session.playerId;
        }

        await this.roundsRepository.create(newBet);
    }

    async handleSuccessBet(player, balance, roundId, bet) {
        if (bet.freeSpin) {
            await this.freeSpinsConsumer.useFreeSpin(player);
        }

        const rate = this.calculateCurrencyRate(player.session);

        await this.upsertBet(player, roundId, bet, rate);
        this.notifyPlacingBetResult(player, balance, bet, rate);

        await this.settleGameRoundConsumer.settleRound(player, roundId);
    }
}
