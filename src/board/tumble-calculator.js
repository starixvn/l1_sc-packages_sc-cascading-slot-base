import defaultDefinition from "./default-definition";

export default class TumbleCalculator {
    calculate(tumble, baseBet, gameOdds) {
        const { originalBoard } = tumble;
        const boardArray = originalBoard.split(",").map((x) => parseInt(x));

        tumble.icons = this.calculateIconOdds(boardArray, gameOdds);
        this.calculateWinAmount(tumble, baseBet);
        return tumble;
    }

    calculateWinAmount(tumble, baseBet) {
        let totalWin = 0;
        Object.values(tumble.icons).forEach((icon) => {
            icon.win = baseBet * icon.odds;
            totalWin += icon.win;
        });

        tumble.win = totalWin;
    }

    calculateIconOdds(boardArray, gameOdds) {
        const occurences = boardArray
            .filter((x) => x !== defaultDefinition.specialSymbols.multiplier && x !== defaultDefinition.specialSymbols.freeSpins)
            .reduce((map, current) => map.set(current, (map.get(current) || 0) + 1), new Map());

        const { oddsByCounts } = gameOdds;
        const icons = {};
        
        occurences.forEach((value, key) => {
            const iconOdds = oddsByCounts[key].find((x) => x.from <= value && x.to >= value)?.odds;

            if (iconOdds) {
                icons[key] = {
                    count: value,
                    odds: iconOdds,
                };
            }
        });

        return icons;
    }
}
