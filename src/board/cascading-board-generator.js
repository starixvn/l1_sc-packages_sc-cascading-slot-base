import { BoardGenerator } from "sc-slot-board-generator";
import defaultDefinition from "./default-definition";

export default class CascadingBoardGenerator {
    constructor(boardSettings, slotConfigs) {
        const { multiplierBonus } = slotConfigs;

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
}
