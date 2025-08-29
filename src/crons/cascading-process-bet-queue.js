import { round } from "mathjs";
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

        betInfo.totalAmount = round(betInfo.betLevel * betInfo.coinValue * betInfo.betMultiplier, 2);
        betInfo.contributionRate = round(contributionRate, 4);
        betInfo.contributionAmount = round(contributionRate * betInfo.totalAmount, 4);

        return betInfo;
    }

    async upsertBet(player, roundId, bet, rate, applicableInterceptors) {
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;

        let newBet = {
            id: roundId,
            uid: player.UID,
            name: player.profile.name,
            freeBet: bet.freeBet,
            time: new Date(),
            freeSpin: bet.freeSpin,
            betLevel: bet.betLevel,
            coinValue: bet.coinValue,
            betMultiplier: bet.betMultiplier,
            totalAmount: bet.totalAmount,
            rate: rate,
            exchangeRateId: this.gameData.exchangeRates.exId,
            odds: {
                oddsByCounts: cascadingSlotsConfig.oddsByCounts,
                freeSpins: cascadingSlotsConfig.freeSpins,
            },
        };

        if (applicableInterceptors) {
            newBet = this.executeInterceptorTransform("enhanceBetRecord", applicableInterceptors, {
                betRecord: newBet,
                bet,
            });
        }

        if (player.session) {
            newBet.siteId = player.session.siteId;
            newBet.currency = player.session.currencyName;

            newBet.operatorId = player.session.operatorId;
            newBet.playerId = player.session.playerId;
            newBet.appType = player.session.system;
            newBet.siteName = player.session.siteName;
        }

        await this.roundsRepository.create(newBet);
    }

    async handleSuccessBet(player, balance, roundId, bet, applicableInterceptors) {
        if (bet.freeSpin) {
            await this.freeSpinsConsumer.useFreeSpin(player);
        }

        const rate = this.calculateCurrencyRate(player.session);

        await this.upsertBet(player, roundId, bet, rate, applicableInterceptors);
        this.notifyPlacingBetResult(player, balance, bet, rate);

        const { betwin } = await this.settleGameRoundConsumer.settleRound(player, roundId);

        if (applicableInterceptors) {
            bet.roundId = roundId;
            bet.betWin = betwin;

            await this.executeInterceptorEvent("afterSuccessEvent", applicableInterceptors, {
                player,
                bet: {
                    roundId,
                    betWin: betwin,
                    baseBetWin: round(betwin * rate, 2),
                    amount: bet.totalAmount,
                    baseAmount: round(bet.totalAmount * rate, 2),
                },
                balance,
            });
        }
    }
}
