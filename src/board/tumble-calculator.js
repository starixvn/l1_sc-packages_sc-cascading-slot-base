export default class TumbleCalculator {
    calculate(tumble, baseBet, gameOdds) {
        const { originalBoard } = tumble;
        const boardArray = originalBoard.split(",");

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
        const occurences = boardArray.reduce((map, current) => map.set(current, (map.get(current) || 0) + 1), new Map());

        const { oddsByCounts } = gameOdds;
        const icons = {};

        Object.entries(oddsByCounts).forEach(([iconValue, odds]) => {
            const iconOcurrence = occurences.get(iconValue);
            const iconOdds = odds.find((x) => x.from <= iconOcurrence && x.to >= iconOcurrence)?.odds;

            if (iconOdds) {
                icons[iconValue] = {
                    count: iconOcurrence,
                    odds: iconOdds,
                };
            }
        });

        return icons;
    }
}
