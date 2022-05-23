import { BoardGenerator } from "sc-slot-board-generator";
import defaultDefinition from "./default-definition";

export default class CascadingBoardGenerator {
    constructor(boardSettings, gameData) {
        const { multiplierBonus } = gameData.gameConfigs.cascadingSlotConfigs;

        this.boardGenerator = new BoardGenerator(boardSettings, {
            symbol: defaultDefinition.specialSymbols.multiplier,
            min: multiplierBonus.min,
            max: multiplierBonus.max,
        });
    }

    generate() {
        return this.boardGenerator.generate();
    }

    explodeAndRefill(board, winSymbols, multipliers) {
        return this.boardGenerator.explodeAndRefill(board, winSymbols, multipliers);
    }

    updateMultiplierConfig(min, max) {
        this.boardGenerator.updateMultiplierConfig(min, max);
    }

    setRefillSymbols(newSymbols, multipliers) {
        this.boardGenerator.setRefillSymbols(newSymbols, multipliers);
    }
}
