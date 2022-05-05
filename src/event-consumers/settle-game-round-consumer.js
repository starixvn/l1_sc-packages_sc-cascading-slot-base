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
        totalMultiplersRepository,
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
        this.totalMultiplersRepository = totalMultiplersRepository;
    }

    async settleRound(player, roundId) {
        const round = await this.queryRound(roundId);

        if (round) {
            this.processSpinning(round);

            round.paid = true;
            round.endTime = new Date();

            const betResult = this.calculateBetResult(round);

            await round.save();
            await this.callEndGame(bet, roundId, round.endTime, betResult);
            await this.userBetResultPublisher.publishToUser(round.uid, this.collectRoundResult(round, betResult));
        }
    }

    async processSpinning(round) {
        const currencyGroupSettings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId);

        const generatedResult = this.boardGenerator.generate();
        round.result = generatedResult.newBoard.join(",");

        const firstTumble = {
            originalBoard: round.result,
            newBoard: round.result,
            multipliers: generatedResult.multipliers,
        };

        const tumbles = [firstTumble];
        round.settlementResult = { tumbles };

        let win = this.settleTumble(round, firstTumble);

        while (win && round.betwin < currencyGroupSettings.maxWinPerRound) {
            const lastTumble = tumbles[tumbles.length - 1];
            const refilledResult = this.boardGenerator.explodeAndRefill(lastTumble.originalBoard.split(","), Object.keys(lastTumble.icons));

            lastTumble.newBoard = refilledResult.newBoard.join(",");
            lastTumble.explodedSymbols = refilledResult.explodedSymbols;
            lastTumble.newSymbols = refilledResult.newSymbols;

            const nextTumble = {
                originalBoard: lastTumble.newBoard,
                newBoard: lastTumble.newBoard,
                multipliers: refilledResult.multipliers,
                win: 0,
            };

            tumbles.push(nextTumble);

            win = this.settleTumble(round, nextTumble);
        }

        this.updateRoundData(round, currencyGroupSettings);
    }

    async processFreeSpins(player, round) {
        const { id, settlementResult } = round;
        if (settlementResult.freeSpins?.odds > 0) {
            await this.freeSpinsConumer.gainFreeSpin(player, { roundId: id, numberOfFreeSpins: settlementResult.freeSpins.odds });
        }
    }

    updateRoundData(round, currencyGroupSettings) {
        const { tumbles } = round.settlementResult;
        const lastTumble = tumbles[tumbles.length - 1];

        round.totalTumbleWin = tumbles.reduce((total, current) => total + current.win, 0);
        round.multiplier = lastTumble.multipliers.reduce((total, current) => total + current, 0);

        if (round.freeSpin) {
            const ingameData = this.gameData.ingame[player.profile.name];
            ingameData.freeSpinsTotalMultiplier = ingameData.freeSpinsTotalMultiplier ?? 0 + round.multiplier;

            round.totalMultiplier = ingameData.freeSpinsTotalMultiplier;
            round.betwin = Math.min(
                round.totalMultiplier > 0 ? round.totalTumbleWin * round.totalMultiplier : round.totalTumbleWin,
                currencyGroupSettings.maxWinPerRound
            );
        } else {
            round.betwin = Math.min(
                round.multiplier > 0 ? round.totalTumbleWin * round.multiplier : round.totalTumbleWin,
                currencyGroupSettings.maxWinPerRound
            );
        }

        this.countFreeSpin(round);
    }

    countFreeSpin(round) {
        const { settlementResult } = round;
        const { tumbles } = settlementResult;
        const lastBoard = tumbles[tumbles.length - 1].originalBoard.split(",").map((x) => parseInt(x));
        const freeSpinCount = lastBoard.filter((x) => x === defaultDefinition.specialSymbols.freeSpins).length;

        const { freeSpins } = this.gameData.gameConfigs.cascadingSlotsConfig;
        const freeSpinOddsConfig = round.freeSpin ? freeSpins.additionalOdds : freeSpins.initialOdds;
        const freeSpinOdds = freeSpinOddsConfig.filter((x) => freeSpinCount >= x.count).map((x) => x.odds);

        settlementResult.freeSpins = {
            count: freeSpinCount,
            odds: Math.max(0, ...freeSpinOdds),
        };
    }

    settleTumble(round, tumble) {
        this.tumbleCalculator.calculate(tumble, round.coinValue * round.betLevel);

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
