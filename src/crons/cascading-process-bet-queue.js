import { Crons } from "sc-slot-game-base";

export default class CascadingProcessBetQueue extends Crons.SlotProcessBetQueue {
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

    async generateBetInfo(payload, freeSpinInfo, player) {
        const betInfo = { ...payload };
        const { cascadingSlotsConfigs } = this.gameData.gameConfigs;
        const contributionRate = cascadingSlotsConfigs.jackpot ? cascadingSlotsConfigs.jackpot.playerContributionRatio : 0;

        betInfo.betMultiplier = cascadingSlotsConfigs.betMultiplier;

        if (freeSpinInfo) {
            const { betLevel, coinValue, betMultiplier } = freeSpinInfo;

            betInfo.betLevel = betLevel;
            betInfo.coinValue = coinValue;
            betInfo.betMultiplier = betMultiplier;
        } else {
            const currentMultiplier = this.totalMultiplierConsumer.getCurrentMultiplier(player);

            if (currentMultiplier) {
                await this.totalMultiplierConsumer.stopChain(player);
            }
        }

        betInfo.amount = betInfo.betLevel * betInfo.coinValue;
        betInfo.totalAmount = parseFloat((betInfo.amount * betInfo.betMultiplier).toFixed(2));
        betInfo.contributionRate = parseFloat(contributionRate.toFixed(4));
        betInfo.contributionAmount = parseFloat((contributionRate * betInfo.totalAmount).toFixed(4));

        return betInfo;
    }

    async upsertBet(player, roundId, bet, rate) {
        const { cascadingSlotsConfigs } = this.gameData.gameConfigs;

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
                oddsByCounts: cascadingSlotsConfigs.oddsByCounts,
                freeSpins: cascadingSlotsConfigs.freeSpins,
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
