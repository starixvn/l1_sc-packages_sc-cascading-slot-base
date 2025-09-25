import { helpers } from "sc-common";
import { Crons } from "sc-slot-game-base";
import { isBuyFreeSpinEnabled } from "../utils";

export default class CascadingProcessBetQueue extends Crons.SlotProcessBetQueue {
    isValidBuyFreeSpin(player) {
        const { features } = this.gameData.gameConfigs.cascadingSlotsConfig;

        return (
            isBuyFreeSpinEnabled(features?.buyFreeSpins, player.session) &&
            !this.freeSpinsConsumer.hasFreeSpin(player) &&
            !this.isInPromotionPeriod(player)
        );
    }

    isInPromotionPeriod(player) {
        return this.hasValidPromotion(player) && player.promotion.lastUsedDate;
    }

    async proceedBet(player, payload) {
        if (payload.buyFreeSpin && this.isValidBuyFreeSpin(player)) {
            this.placeBetPublisher.publishGameFailedBet(player.UID, { endBet: -1, notice: { errorCode: helpers.noticeHelper.invalidBet } });
            return;
        }

        await super.proceedBet(player, payload);
    }

    async generateBetInfo(payload, freeSpinInfo, player) {
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

        let buyFreeSpinMultiplier = 1;
        if (payload.buyFreeSpin) {
            buyFreeSpinMultiplier = cascadingSlotsConfig.features.buyFreeSpins.multiplier;
        }

        betInfo.amount = betInfo.betLevel * betInfo.coinValue;
        betInfo.totalAmount = parseFloat((betInfo.amount * betInfo.betMultiplier * buyFreeSpinMultiplier).toFixed(2));
        betInfo.contributionRate = parseFloat(contributionRate.toFixed(4));
        betInfo.contributionAmount = parseFloat((contributionRate * betInfo.totalAmount * buyFreeSpinMultiplier).toFixed(4));

        return betInfo;
    }

    async upsertBet(player, roundId, bet, rate, applicableInterceptors, buyFreeSpinRefRoundId) {
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
            buyFreeSpin: bet.buyFreeSpin,
            rate: rate,
            exchangeRateId: this.gameData.exchangeRates.exId,
            buyFreeSpinRefRoundId: buyFreeSpinRefRoundId,
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
            newBet.currencyCode = player.session.currencyCode;
            newBet.currencyGroupId = player.session.currencyGroupId;
            newBet.operatorId = player.session.operatorId;
            newBet.playerId = player.session.playerId;
            newBet.appType = player.session.system;
            newBet.siteName = player.session.siteName;
        }

        await this.roundsRepository.create(newBet);
    }

    async handleSuccessBet(player, balance, roundId, bet, applicableInterceptors) {
        let buyFreeSpinRefRoundId = null;

        if (bet.freeSpin) {
            const freeSpin = await this.freeSpinsConsumer.useFreeSpin(player);
            buyFreeSpinRefRoundId = freeSpin?.buyFreeSpinRefRoundId;
        }

        const rate = this.calculateCurrencyRate(player.session);

        await this.upsertBet(player, roundId, bet, rate, applicableInterceptors, buyFreeSpinRefRoundId);
        !bet.autoSettle && this.notifyPlacingBetResult(player, balance, bet, rate);

        const { betwin } = await this.settleGameRoundConsumer.settleRound(player, roundId);

        if (applicableInterceptors) {
            bet.roundId = roundId;
            bet.betWin = betwin;

            await this.executeInterceptorEvent("afterSuccessEvent", applicableInterceptors, {
                player,
                bet: {
                    roundId,
                    betWin: betwin,
                    baseBetWin: betwin * rate,
                    amount: bet.totalAmount,
                    baseAmount: bet.totalAmount * rate,
                },
                balance,
            });
        }
    }
}
