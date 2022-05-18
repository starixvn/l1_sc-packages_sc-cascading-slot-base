import awilix from "awilix";
import { SlotContainerRegistry } from "sc-slot-game-base";
import RoundCalculator from "./board/round-calculator";
import TumbleCalculator from "./board/tumble-calculator";
import { PlaceBetConsumer, TotalMultiplierConsumer } from "./event-consumers";
import SettleGameRoundConsumer from "./event-consumers/settle-game-round-consumer";
import HttpRouter from "./routers/http-router";
import { BoardGenerator } from from "sc-slot-board-generator";

const { asClass, asValue } = awilix;

export default class CascadingSlotContainerRegistry extends SlotContainerRegistry {
    /**
     * @param {Object} appConfigs
     */
    register(appConfigs, definition, gameData) {
        this.registerBoardUtilities();
        super.register(appConfigs, definition, gameData);

        return this.container;
    }

    registerBoardUtilities() {
        this.container.register({
            tumbleCalculator: asClass(TumbleCalculator),
            roundCalculator: asClass(RoundCalculator).proxy(),
            boardGenerator: asClass(BoardGenerator)
        });
    }

    registerRouters() {
        super.registerRouters();

        this.container.register({
            httpRouter: asClass(HttpRouter),
        });
    }

    registerConsumers() {
        super.registerConsumers();

        this.container.register({
            placeBetConsumer: asClass(PlaceBetConsumer).singleton(),
            settleGameRoundConsumer: asClass(SettleGameRoundConsumer).singleton().proxy(),
            totalMultiplierConsumer: asClass(TotalMultiplierConsumer).singleton(),
        });
    }
}
