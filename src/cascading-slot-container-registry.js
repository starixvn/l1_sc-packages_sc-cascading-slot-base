import awilix from "awilix";
import { SlotContainerRegistry } from "sc-slot-game-base";
import { PlaceBetConsumer, TotalMultiplierConsumer } from "./event-consumers";
import SettleGameRoundConsumer from "./event-consumers/settle-game-round-consumer";
import HttpRouter from "./routers/http-router";

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

    registerBoardUtilities() {}

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
