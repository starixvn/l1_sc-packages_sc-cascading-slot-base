import { BoardGenerator } from "sc-slot-board-generator";
import defaultDefinition from "./default-definition";

export default class CascadingBoardGenerator {
    constructor(definition, gameData, boardSettings, logService) {
        this.definition = definition;
        this.boardSettings = boardSettings;
        this.gameData = gameData;
        this.logService = logService;
        this.multiplierBonus = {};
    }

    initialize() {
        const { multiplierBonus, mode: difficulty } = this.gameData.gameConfigs.cascadingSlotsConfig;

        this.multiplierBonus = multiplierBonus;
        this.difficulty = difficulty;

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

    updateBoardConfig(difficulty, minMultiplierBonus, maxMultiplierBonus) {
        if (difficulty !== this.difficulty || this.multiplierBonus.min !== minMultiplierBonus || this.multiplierBonus.max !== maxMultiplierBonus) {
            this.difficulty = difficulty;
            this.multiplierBonus.min = minMultiplierBonus;
            this.multiplierBonus.max = maxMultiplierBonus;

            this.boardGenerator.setDifficulty(difficulty);
            this.boardGenerator.updateMultiplierConfig(minMultiplierBonus, maxMultiplierBonus);

            this.logService.logError(
                `${this.definition.name} updated board configuration!!! Mode: ${difficulty}, Multipler: ${minMultiplierBonus} - ${maxMultiplierBonus}`
            );
        }
    }

    setRefillSymbols(newSymbols, multipliers) {
        this.boardGenerator.setRefillSymbols(newSymbols, multipliers);
    }
}
