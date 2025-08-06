import { asClass, asValue } from "awilix";
import { SlotContainerRegistry } from "sc-slot-game-base";
import CascadingBoardGenerator from "./board/cascading-board-generator";
import defaultDefinition from "./board/default-definition";
import RoundCalculator from "./board/round-calculator";
import TumbleCalculator from "./board/tumble-calculator";
import { CascadingBot, CascadingGameCron, CascadingProcessBetQueue } from "./crons";
import {
    FreeSpinsConsumer,
    InGameConsumer,
    PlaceBetConsumer,
    PromotionFreeSpinsConsumer,
    SettleGameRoundConsumer,
    TotalMultiplierConsumer,
    UserSignInConsumer,
} from "./event-consumers";
import { HistoryQuery } from "./query-apis";
import HttpRouter from "./routers/cascading-http-router";

export default class CascadingSlotContainerRegistry extends SlotContainerRegistry {
    register(appConfigs, definition, gameData) {
        this.registerBoardUtilities();
        super.register(appConfigs, definition, gameData);

        return this.container;
    }

    registerBoardUtilities() {
        this.container.register({
            boardSettings: asValue(defaultDefinition.boardSettings),
        });

        this.container.register({
            tumbleCalculator: asClass(TumbleCalculator),
            roundCalculator: asClass(RoundCalculator).proxy(),
            boardGenerator: asClass(CascadingBoardGenerator).singleton(),
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
            freeSpinsConsumer: asClass(FreeSpinsConsumer).singleton(),
            inGameConsumer: asClass(InGameConsumer).singleton().proxy(),
            userSignInConsumer: asClass(UserSignInConsumer).singleton().proxy(),
            promotionFreeSpinsConsumer: asClass(PromotionFreeSpinsConsumer).singleton().proxy(),
        });
    }

    registerApis() {
        super.registerApis();

        this.container.register({
            historyQuery: asClass(HistoryQuery).singleton(),
        });
    }

    registerCrons() {
        super.registerCrons();

        this.container.register({
            bot: asClass(CascadingBot).singleton().proxy(),
            gameCron: asClass(CascadingGameCron).singleton().proxy(),
            processBetQueue: asClass(CascadingProcessBetQueue).singleton().proxy(),
        });
    }
}
