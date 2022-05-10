import defaultDefinition from "./default-definition";

export default class RoundCalculator {
    constructor({ boardGenerator, tumbleCalculator }) {
        this.boardGenerator = boardGenerator;
        this.tumbleCalculator = tumbleCalculator;
    }

    processSpinning(round, totalMultiplier = 0, maxWinPerRound = Number.MAX_VALUE, preGeneratedResult = null) {
        const generatedResult = preGeneratedResult?.shift() ?? this.boardGenerator.generate();
        round.result = generatedResult.newBoard.join(",");

        const firstTumble = {
            originalBoard: round.result,
            newBoard: round.result,
            multipliers: generatedResult.multipliers,
        };

        const tumbles = [firstTumble];
        round.settlementResult = { tumbles };

        let win = this.settleTumble(round, firstTumble);
        this.updateRound(round, totalMultiplier, maxWinPerRound);

        while (win && round.betwin < maxWinPerRound) {
            const lastTumble = tumbles[tumbles.length - 1];
            const refilledResult =
                preGeneratedResult?.shift() ??
                this.boardGenerator.explodeAndRefill(lastTumble.originalBoard.split(","), Object.keys(lastTumble.icons));

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
            this.updateRound(round, totalMultiplier, maxWinPerRound);
        }

        this.countFreeSpin(round);
        return round;
    }

    settleTumble(round, tumble) {
        this.tumbleCalculator.calculate(tumble, round.coinValue * round.betLevel, round.odds);
        return tumble.win > 0;
    }

    updateRound(round, totalMultiplier, maxWinPerRound) {
        const { tumbles } = round.settlementResult;
        const lastTumble = tumbles[tumbles.length - 1];

        round.totalTumbleWin = tumbles.reduce((total, current) => total + current.win, 0);
        round.multiplier = lastTumble.multipliers.reduce((total, current) => total + current, 0);

        if (round.freeSpin) {
            round.totalMultiplier = round.totalTumbleWin > 0 ? totalMultiplier + round.multiplier : totalMultiplier;
            round.betwin = Math.min(round.totalMultiplier > 0 ? round.totalTumbleWin * round.totalMultiplier : round.totalTumbleWin, maxWinPerRound);
        } else {
            round.betwin = Math.min(round.multiplier > 0 ? round.totalTumbleWin * round.multiplier : round.totalTumbleWin, maxWinPerRound);
        }
    }

    countFreeSpin(round) {
        const { settlementResult } = round;
        const { tumbles } = settlementResult;
        const lastBoard = tumbles[tumbles.length - 1].originalBoard.split(",").map((x) => parseInt(x));
        const freeSpinCount = lastBoard.filter((x) => x === defaultDefinition.specialSymbols.freeSpins).length;

        const { freeSpins } = round.odds;
        const freeSpinOddsConfig = round.freeSpin ? freeSpins.additionalOdds : freeSpins.initialOdds;
        const freeSpinOdds = freeSpinOddsConfig.filter((x) => freeSpinCount >= x.count).map((x) => x.odds);

        settlementResult.freeSpins = {
            count: freeSpinCount,
            odds: Math.max(0, ...freeSpinOdds),
        };
    }
}
