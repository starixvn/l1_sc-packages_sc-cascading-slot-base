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

    initialize(isFreeSpin) {
        const { multiplierBonus, volatility } = this.gameData.gameConfigs.cascadingSlotsConfig;

        this.multiplierBonus = multiplierBonus;
        this.difficulty = difficulty;

        return new BoardGenerator(
            this.boardSettings,
            {
                symbol: defaultDefinition.specialSymbols.multiplier,
                min: multiplierBonus.min,
                max: multiplierBonus.max,
            },
            null,
            volatility,
            isFreeSpin
        );
    }
}
