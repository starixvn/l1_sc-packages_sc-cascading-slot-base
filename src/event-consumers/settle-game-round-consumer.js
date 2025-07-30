import { round as mathRound } from "mathjs";
import { Core } from "sc-game-base";

export default class SettleGameRoundConsumer extends Core.BaseEventConsumers.SettleGameRoundConsumer {
    constructor({
        definition,
        gameData,
        roundResultPublisher,
        userBetResultPublisher,
        freeSpinsConsumer,
        endGame,
        roundsRepository,
        betsRepository,
        totalMultiplierConsumer,
        roundCalculator,
        gameManagementApiClientFactory,
        promotionBetInterceptor,
    }) {
        super({
            definition,
            gameData,
            roundResultPublisher,
            userBetResultPublisher,
            endGame,
            roundsRepository,
            betsRepository,
            gameManagementApiClientFactory,
        });

        this.freeSpinsConsumer = freeSpinsConsumer;
        this.totalMultiplierConsumer = totalMultiplierConsumer;
        this.roundCalculator = roundCalculator;
        this.promotionBetInterceptor = promotionBetInterceptor;
    }

    async settleRound(player, roundId) {
        const round = await this.queryRound(roundId);

        if (round) {
            await this.processSpinning(player, round);

            round.paid = true;
            round.endTime = new Date();

            const betResult = this.calculateBetResult(round);

            await round.save();

            const metaData = this.createMetadata({ bet: round, settlementResult: round.settlementResult, result: round.result });
            await this.callEndGame(round, roundId, round.endTime, betResult, metaData);
            await this.processFreeSpins(player, round);
            await this.userBetResultPublisher.publishToUser(round.uid, this.collectRoundResult(player, round, betResult));
            await this.promotionBetInterceptor.endPromotionEvent({ player });
        }
    }

    async processSpinning(player, round) {
        const currencyGroupSettings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);
        const currentTotalMultiplier = this.totalMultiplierConsumer.getCurrentMultiplier(player);
        const maxWinPerRound = mathRound(currencyGroupSettings.maxWinPerRound * round.totalAmount, 2);

        round = this.roundCalculator.processSpinning(
            round,
            currentTotalMultiplier,
            maxWinPerRound,
            this.gameData.settlementResultFromAdmin[player.profile.name]
        );

        if (round.freeSpin && round.betwin > 0 && round.multiplier > 0) {
            await this.totalMultiplierConsumer.increaseTotalMultiplier(player, { roundId: round.id, multiplier: round.multiplier });
        }

        delete this.gameData.settlementResultFromAdmin[player.profile.name];
    }

    async processFreeSpins(player, round) {
        const { id, settlementResult } = round;
        if (settlementResult.freeSpins?.odds > 0) {
            await this.freeSpinsConsumer.gainFreeSpin(
                player,
                {
                    roundId: id,
                    totalAmount: round.totalAmount,
                    coinValue: round.coinValue,
                    betLevel: round.betLevel,
                    betMultiplier: round.betMultiplier,
                    numberOfFreeSpins: settlementResult.freeSpins.odds,
                },
                this.definition.freeSpinLiveSeconds
            );
        }

        const totalAvailableFreeSpins = this.freeSpinsConsumer.getTotalAvaiableFreeSpins(player);

        if (!totalAvailableFreeSpins) {
            await this.totalMultiplierConsumer.stopChain(player);
        }
    }

    queryRound(roundId) {
        return this.roundsRepository.findOne({ id: roundId, paid: false }).exec();
    }

    calculateBetResult(round) {
        const betResult = {};
        const { bigWinRatio } = this.gameData.gameConfigs.cascadingSlotsConfig;

        betResult.totalBetAmount = round.totalAmount;
        betResult.totalWin = round.betwin;
        betResult.netWin = round.betwin > 0 ? round.betwin - round.totalAmount : 0;
        betResult.totalLost = betResult.totalBetAmount > betResult.totalWin ? betResult.totalBetAmount - betResult.totalWin : 0;
        betResult.bigWin = betResult.totalWin / bigWinRatio >= betResult.totalBetAmount;

        return betResult;
    }

    collectRoundResult(player, round, betResult) {
        return {
            finish: {
                roundId: round.id,
                result: round.result,
                win: round.betwin,
                bigWin: betResult.bigWin,
                freeSpins: round.settlementResult.freeSpins.odds,
                totalFreeSpins: this.freeSpinsConsumer.getTotalAvaiableFreeSpins(player),
                tumbles: round.settlementResult.tumbles.map((tumble) => ({
                    icons: tumble.icons,
                    win: tumble.win,
                    result: tumble.newBoard,
                    settlement: {
                        explode: tumble.explodedSymbols,
                        new: tumble.newSymbols,
                    },
                    multipliers: tumble.multipliers,
                })),
                multiplier: round.multiplier,
                totalMultiplier: round.totalMultiplier,
                isFreeSpin: round.freeSpin,
                reachMaxWin: round.reachMaxWin,
                actualBetwin: round.actualBetwin,
            },
        };
    }

    formatEndGameInfo(bet, roundId, time, betResult) {
        const { gameInfo, settlementInfo } = super.formatEndGameInfo(bet, roundId, time, betResult);
        settlementInfo.redPlay = bet.freeSpin ? 0 : settlementInfo.redPlay;

        return { gameInfo, settlementInfo };
    }
}
