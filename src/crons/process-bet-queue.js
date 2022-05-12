import { Crons } from "sc-slot-game-base";
import { helpers } from "sc-common";
import { SlotNoticeHelper } from "sc-slot-game-base/src/helpers";

export default class ProcessBetQueue extends Crons.SlotProcessBetQueue {
    /**
     * @param {SlotGameDefinition} definition
     * @param {SlotGameData} gameData
     * @param {Core.BaseEventPublishers.PlaceBetPublisher} placeBetPublisher
     * @param {FreeSpinsConsumer} freeSpinsConsumer
     * @param {SettleGameRoundConsumer} settleGameRoundConsumer
     * @param {placeBetApi} dependencies.placeBet
     * @param {logger} dependencies.logService
     * @param {mongoose.Model} dependencies.roundsRepository
     * @param {mongoose.Model} dependencies.betsRepository
     * @param {mongoose.Model} dependencies.betLogsRepository
     * @param {mongoose.Model} dependencies.userInfosRepository
     * @param {EventConsumers.IdCountersConsumer} dependencies.idCountersConsumer
     * @param {TotalMultiplierConsumer} dependencies.totalMultiplierConsumer
     */
    constructor({
        definition,
        gameData,
        placeBetPublisher,
        freeSpinsConsumer,
        settleGameRoundConsumer,
        placeBet,
        logService,
        roundsRepository,
        betsRepository,
        betLogsRepository,
        userInfosRepository,
        idCountersConsumer,
        baseMetrics,
        totalMultiplierConsumer,
    }) {
        super({
            definition,
            gameData,
            placeBetPublisher,
            placeBet,
            logService,
            betsRepository,
            betLogsRepository,
            userInfosRepository,
            baseMetrics,
            freeSpinsConsumer,
            settleGameRoundConsumer,
            roundsRepository,
            idCountersConsumer,
        });

        this.totalMultiplierConsumer = totalMultiplierConsumer;
    }

    async proceedBet(player, payload) {
        if (this.gameData.ingame[player.profile.name]?.finish) {
            this.placeBetPublisher.publishGameFailedBet(player.UID, { endBet: -1, notice: { errorCode: helpers.noticeHelper.cannotPlaceBet } });

            return;
        }

        const soonestExpiredFreeSpinSet = this.freeSpinsConsumer.getSoonestExpiredFreeSpinSet(player);
        const { slotsConfig } = this.gameData.gameConfigs;
        const contributionRate = slotsConfig.jackpot ? slotsConfig.jackpot.playerContributionRatio : 0;

        payload.freeSpin = payload.freeSpin || !!soonestExpiredFreeSpinSet;
        payload.betMultiplier = slotsConfig.betMultiplier;

        if (payload.freeSpin && !soonestExpiredFreeSpinSet) {
            this.placeBetPublisher.publishGameFailedBet(player.UID, { endBet: -1, notice: { errorCode: SlotNoticeHelper.invalidFreeSpin } });

            return;
        }

        if (soonestExpiredFreeSpinSet) {
            const { betLevel, coinValue, betMultiplier } = soonestExpiredFreeSpinSet;

            payload.betLevel = betLevel;
            payload.coinValue = coinValue;
            payload.betMultiplier = betMultiplier;
        } else {
            const currentMultiplier = this.totalMultiplierConsumer.getCurrentMultiplier(player);

            if (currentMultiplier) {
                await this.totalMultiplierConsumer.stopChain(player);
            }
        }

        payload.amount = payload.betLevel * payload.coinValue;
        payload.totalAmount = parseFloat((payload.amount * payload.betMultiplier).toFixed(2));
        payload.contributionRate = parseFloat(contributionRate.toFixed(4));
        payload.contributionAmount = parseFloat((contributionRate * payload.totalAmount).toFixed(4));

        await this.idCountersConsumer.consume("round");
        this.gameData.roundId++;

        const isValidBet = await this.validateBetRequest(player, payload);

        if (isValidBet) {
            await this.proceedOperatorBet(player, payload);
        }
    }

    async proceedOperatorBet(player, payload) {
        const betInfo = this.formatApiBetInfo(payload);

        const apiResult = await this.placeBet({ id: player.UID, session: player.session }, betInfo);
        const { response } = apiResult;

        if (apiResult.isOk) {
            await this.handleSuccessBet(player, response, betInfo.gameRoundId, payload);
        } else {
            this.handleFailedBet(player, response, payload);

            if (
                (player.profile.minBet !== response.apiError?.minBet || player.profile.maxBet !== response.apiError?.maxBet) &&
                response.apiError?.minBet > 0 &&
                response.apiError?.maxBet > 0
            ) {
                await this.updateUserStakeLevel(player, response.apiError.minBet, response.apiError.maxBet);
            }
        }

        const totalProcessedTime = (new Date() - payload.receivedTime) / 1000;
        this.baseMetrics.collectBetProcessedTime(totalProcessedTime);
    }

    async upsertBet(player, roundId, bet, rate) {
        const { slotsConfig } = this.gameData.gameConfigs;

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
                oddsByCounts: slotsConfig.oddsByCounts,
                freeSpins: slotsConfig.freeSpins,
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
