import { BoardGenerator } from "sc-slot-board-generator";
import defaultDefinition from "./default-definition";
import FsbBoardDefinition from "./fsb-board-definition";

export default class CascadingBoardGenerator {
    constructor(definition, gameData, boardSettings, logService) {
        this.definition = definition;
        this.boardSettings = boardSettings;
        this.gameData = gameData;
        this.logService = logService;
        this.multiplierBonus = {};
        this.boardGenerator = null;
    }

    initialize(isFreeSpin, promotionId) {
        const { multiplierBonus, volatility } = this.gameData.gameConfigs.cascadingSlotsConfig;
        const { enablePromotionRTP } = this.gameData.gameConfigs;
        this.multiplierBonus = multiplierBonus;

        this.boardGenerator = new BoardGenerator(
            this.boardSettings,
            {
                symbol: defaultDefinition.specialSymbols.multiplier,
                min: multiplierBonus.min,
                max: multiplierBonus.max,
            },
            isFreeSpin && promotionId && enablePromotionRTP ? FsbBoardDefinition : null,
            volatility,
            isFreeSpin
        );

        return this.boardGenerator;
    }

    generate() {
        if (!this.boardGenerator) {
            this.initialize();
        }
        return this.boardGenerator.generate();
    }

    explodeAndRefill(originalBoard, explodedSymbols, multipliers) {
        if (!this.boardGenerator) {
            this.initialize();
        }
        return this.boardGenerator.explodeAndRefill(originalBoard, explodedSymbols, multipliers);
    }

    setRefillSymbols(symbols, positions) {
        if (!this.boardGenerator) {
            this.initialize();
        }
        return this.boardGenerator.setRefillSymbols(symbols, positions);
    }

    updateBoardConfig(difficulty, minMultiplier, maxMultiplier) {
        if (!this.boardGenerator) {
            this.initialize();
        }

        const { mode: currentDifficulty, multiplierBonus } = this.gameData.gameConfigs.cascadingSlotsConfig;

        if (difficulty !== currentDifficulty) {
            this.boardGenerator.setDifficulty(difficulty);
        }

        if (minMultiplier !== multiplierBonus.min || maxMultiplier !== multiplierBonus.max) {
            this.boardGenerator.updateMultiplierConfig(minMultiplier, maxMultiplier);
        }
    }
}
