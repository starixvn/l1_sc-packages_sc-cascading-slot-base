import { BoardGenerator } from "sc-slot-board-generator";
import defaultDefinition from "./default-definition";

export default class CascadingBoardGenerator {
    constructor(boardSettings, gameData) {
        this.boardSettings = boardSettings;
        this.gameData = gameData;
    }

    initialize() {
        const { multiplierBonus, mode: difficulty } = this.gameData.gameConfigs.cascadingSlotsConfig;

        this.boardGenerator = new BoardGenerator(
            this.boardSettings,
            {
                symbol: defaultDefinition.specialSymbols.multiplier,
                min: multiplierBonus.min,
                max: multiplierBonus.max,
            },
            null,
            difficulty
        );
    }

    generate() {
        return this.boardGenerator.generate();
    }

    explodeAndRefill(board, winSymbols, multipliers) {
        return this.boardGenerator.explodeAndRefill(board, winSymbols, multipliers);
    }

    updateBoardConfig(difficulty, minBetMultiplier, maxBetMultiplier) {
        this.boardGenerator.setDifficulty(difficulty);
        this.boardGenerator.updateMultiplierConfig(minBetMultiplier, maxBetMultiplier);
    }

    setRefillSymbols(newSymbols, multipliers) {
        this.boardGenerator.setRefillSymbols(newSymbols, multipliers);
    }
}
