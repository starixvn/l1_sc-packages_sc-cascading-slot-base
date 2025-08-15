import { Crons } from "sc-slot-game-base";

export default class CascadingProcessBetQueue extends Crons.SlotProcessBetQueue {
    async proceedBet(player, payload) {
        if (payload.buyFreeSpin && this.freeSpinsConsumer.hasFreeSpin(player)) {
            this.placeBetPublisher.publishGameFailedBet(player.UID, { endBet: -1, notice: { errorCode: helpers.noticeHelper.cannotPlaceBet } });
        } else {
            await super.proceedBet(player, payload);
        }
    }

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

        const buyFreeSpinRate = payload.buyFreeSpin ? cascadingSlotsConfig.buyFreeSpinRate : 1;

        betInfo.amount = betInfo.betLevel * betInfo.coinValue;
        betInfo.totalAmount = parseFloat((betInfo.amount * betInfo.betMultiplier * buyFreeSpinRate).toFixed(2));
        betInfo.contributionRate = parseFloat(contributionRate.toFixed(4));
        betInfo.contributionAmount = parseFloat((contributionRate * betInfo.totalAmount * buyFreeSpinRate).toFixed(4));

        return betInfo;
    }

    async upsertBet(player, roundId, bet, rate, buyFreeSpinRefRoundId) {
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
            buyFreeSpin: bet.buyFreeSpin,
            rate: rate,
            exchangeRateId: this.gameData.exchangeRates.exId,
            buyFreeSpinRefRoundId: buyFreeSpinRefRoundId,
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
        let buyFreeSpinRefRoundId = null;

        if (bet.freeSpin) {
            const freeSpin = await this.freeSpinsConsumer.useFreeSpin(player);
            buyFreeSpinRefRoundId = freeSpin.buyFreeSpinRefRoundId;
        }

        const rate = this.calculateCurrencyRate(player.session);

        await this.upsertBet(player, roundId, bet, rate, buyFreeSpinRefRoundId);
        this.notifyPlacingBetResult(player, balance, bet, rate);

        await this.settleGameRoundConsumer.settleRound(player, roundId);
    }
}
