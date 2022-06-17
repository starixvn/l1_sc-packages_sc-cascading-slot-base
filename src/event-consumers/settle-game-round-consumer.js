import { Core } from "sc-game-base";
import { round as mathRound } from "mathjs";

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
    }) {
        super({
            definition,
            gameData,
            roundResultPublisher,
            userBetResultPublisher,
            endGame,
            roundsRepository,
            betsRepository,
        });

        this.freeSpinsConsumer = freeSpinsConsumer;
        this.totalMultiplierConsumer = totalMultiplierConsumer;
        this.roundCalculator = roundCalculator;
    }

    async settleRound(player, roundId) {
        const round = await this.queryRound(roundId);

        if (round) {
            this.processSpinning(player, round);

            round.paid = true;
            round.endTime = new Date();

            const betResult = this.calculateBetResult(round);

            await round.save();
            await this.callEndGame(round, roundId, round.endTime, betResult);
            await this.processFreeSpins(player, round);
            await this.userBetResultPublisher.publishToUser(round.uid, this.collectRoundResult(player, round, betResult));
        }
    }

    async processSpinning(player, round) {
        const currencyGroupSettings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);
        const currentTotalMultiplier = this.totalMultiplierConsumer.getCurrentMultiplier(player);
        const maxWinPerRound = mathRound(currencyGroupSettings.maxWinPerRound * round.totalAmount, 2);
        round.maxWin = maxWinPerRound;

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
        betResult.bigWin = betResult.totalWin / bigWinRatio > betResult.totalBetAmount;

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
                maxWin: round.maxWin,
            },
        };
    }

    formatEndGameInfo(bet, roundId, time, betResult) {
        const gameInfo = {
            gameId: this.definition.id,
            gameRoundId: roundId,
            siteId: bet.siteId,
            time: time,
            operatorId: bet.operatorId,
            playerId: bet.playerId,
            partnerId: bet.operatorId,
            memberId: bet.playerId,
        };
        const settlementInfo = {
            redPlay: bet.freeSpin ? 0 : betResult.totalBetAmount,
            freeBet: bet.freeBet,
        };

        if (betResult.totalWin > 0) {
            settlementInfo.red = betResult.totalWin;
        }

        if (betResult.netWin > 0) {
            settlementInfo.redWin = betResult.netWin;
        }

        if (betResult.totalLost > 0) {
            settlementInfo.redLost = betResult.totalLost;
        }

        return { gameInfo, settlementInfo };
    }
}
