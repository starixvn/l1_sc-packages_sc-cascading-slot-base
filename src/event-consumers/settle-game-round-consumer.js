import { Core } from "sc-game-base";
import defaultDefinition from "../board/default-definition";

export default class SettleGameRoundConsumer extends Core.BaseEventConsumers.SettleGameRoundConsumer {
    constructor({
        definition,
        gameData,
        roundResultPublisher,
        userBetResultPublisher,
        freeSpinsConsumer,
        boardGenerator,
        tumbleCalculator,
        endGame,
        roundsRepository,
        betsRepository,
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

        this.freeSpinsConumer = freeSpinsConsumer;
        this.boardGenerator = boardGenerator;
        this.tumbleCalculator = tumbleCalculator;
    }

    async settleRound(player, roundId) {
        const round = await this.queryRound(roundId);

        if (round) {
            this.processSpinning(round);
            const betResult = this.calculateBetResult(round);

            const { id, endTime } = round;
            await round.save();
            await this.callEndGame(bet, id, endTime, betResult);
            await this.userBetResultPublisher.publishToUser(round.uid, this.collectRoundResult(round, betResult));
        }
    }

    processSpinning(round) {
        const currencyGroupSettings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);

        const generatedResult = this.boardGenerator.generate();
        round.result = generatedResult.newBoard.join(",");
        const firstTumble = {
            originalBoard: round.result,
            multipliers: generatedResult.multipliers,
        };

        const tumbles = [firstTumble];
        round.settlementResult = {
            tumbles,
        };

        let win = this.settleTumble(round, firstTumble);

        while (win && round.betwin < currencyGroupSettings.maxWinPerRound) {
            const lastTumble = tumbles[tumbles.length - 1];
            const refillResult = this.boardGenerator.explodeAndRefill(lastTumble.originalBoard.split(","), Object.keys(lastTumble.icons));

            lastTumble.newBoard = refillResult.newBoard.join(",");
            const nextTumble = {
                originalBoard: lastTumble.newBoard,
                multipliers: refillResult.multipliers,
                explodedSymbols: refillResult.explodedSymbols,
                newSymbols: refillResult.newSymbols,
            };

            tumbles.push(nextTumble);

            win = this.settleTumble(round, nextTumble, currencyGroupSettings);
        }

        this.countFreeSpin(round);

        round.paid = true;
        round.endTime = new Date();
    }

    countFreeSpin(round) {
        const { settlementResult } = round;
        const { tumbles } = settlementResult;
        const lastBoard = tumbles[tumbles.length - 1].originalBoard.split(",").map((x) => parseInt(x));
        const freeSpinCount = lastBoard.filter((x) => x === defaultDefinition.specialSymbols.freeSpins).length;

        const { oddsByCounts } = this.gameData.gameConfigs.cascadingSlotsConfig;
        const freeSpinOdds = oddsByCounts.freeSpins.initialOdds.filter((x) => freeSpinCount >= x.count).map((x) => x.odds);

        if (freeSpinOdds.length > 0) {
            settlementResult.freeSpins = {
                count: freeSpinCount,
                odds: Math.max(...freeSpinOdds),
            };
        }
    }

    settleTumble(round, tumble, currencyGroupSettings) {
        this.tumbleCalculator.calculate(tumble, round.coinValue * round.betLevel);

        round.totalTumbleWin += tumble.win;
        round.totalMultiplier = tumble.multipliers.reduce((total, current) => total + current, 0);
        round.betwin = Math.min(round.totalTumbleWin * (round.totalMultiplier > 0 ? round.totalMultiplier : 1), currencyGroupSettings.maxWinPerRound);

        return tumble.win > 0;
    }

    queryRound(roundId) {
        return this.roundsRepository.findOne({ id: roundId, paid: false }).exec();
    }

    calculateBetResult(round) {
        const { bigWinRatio } = this.gameData.gameConfigs.slotsConfig;

        betResult.totalBetAmount = round.totalAmount;
        betResult.totalWin = round.betwin;
        betResult.netWin = round.betwin > 0 ? round.betwin - round.totalAmount : 0;
        betResult.totalLost = betResult.totalBetAmount > betResult.totalWin ? betResult.totalBetAmount - betResult.totalWin : 0;
        betResult.bigWin = betResult.totalWin / bigWinRatio > betResult.totalBetAmount;

        return betResult;
    }

    collectRoundResult(round, betResult) {
        return {
            finish: {
                roundId: round.id,
                result: round.result,
                win: round.betwin,
                bigWin: betResult.bigWin,
                freeSpins: round.settlementResult.freeSpins.odds,
                tumbles: round.settlementResult.tumbles.map((tumble) => ({
                    icons: tumble.icons,
                    win: tumble.win,
                    result: tumble.newBoard,
                    settlement: {
                        explode: tumble.explode,
                        new: tumble.new,
                    },
                })),
            },
        };
    }
}
