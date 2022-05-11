import { asClass } from "awilix";
import * as Slot from "sc-slot-game-base";
import { HistoryQuery } from "./query-apis";
import * as EventConsumers from "./event-consumers";

export default class ServiceContainerRegistry extends Slot.SlotContainerRegistry {
    registerConsumers() {
        super.registerConsumers();

        this.container.register({
            placeBetConsumer: asClass(EventConsumers.PlaceBetConsumer).singleton(),
        });
    }

    registerApis() {
        super.registerApis();

        this.container.register({
            historyQuery: asClass(HistoryQuery).singleton(),
        });
    }
}
