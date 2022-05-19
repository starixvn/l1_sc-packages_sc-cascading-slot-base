export default class TumbleCalculator {
    calculate(tumble, baseBet, gameOdds) {
        const { originalBoard } = tumble;
        const boardArray = originalBoard.split(",");
        const occurences = boardArray.reduce((map, current) => map.set(current, (map.get(current) || 0) + 1), new Map());

        tumble.icons = this.calculateIconOdds(occurences, gameOdds);
        tumble.win = Object.values(tumble.icons).reduce((total, icon) => total + icon.odds * baseBet, 0);

        return tumble;
    }

    calculateIconOdds(occurences, gameOdds) {
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
