import { asClass, asValue, asFunction } from "awilix";
import { SlotContainerRegistry } from "sc-slot-game-base";
import CascadingBoardGenerator from "./board/cascading-board-generator";
import defaultDefinition from "./board/default-definition";
import ChainManager from "./board/chain-manager";
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
    UserChainConsumer,
    UserSignInConsumer,
} from "./event-consumers";
import { ChainInterceptor, CascadingSlotPromotionInterceptor } from "./event-interceptors";
import { HistoryQuery } from "./query-apis";
import HttpRouter from "./routers/cascading-http-router";
import UserSession from "./models/user-session";
export default class CascadingSlotContainerRegistry extends SlotContainerRegistry {
    register(appConfigs, definition, gameData) {
        this.registerBoardUtilities();
        this.registerResultChains();
        super.register(appConfigs, definition, gameData);

        return this.container;
    }

    registerModels() {
        super.registerModels();

        this.container.register({
            userSessionsRepository: asValue(UserSession),
        });
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

    /**
     * Register all result chain related dependencies in a modular way
     * This includes chain manager, user chain consumer, and chain interceptor
     */
    registerResultChains() {
        this.container.register({
            resultChainManager: asClass(ChainManager).singleton().proxy(),
            userChainConsumer: asClass(UserChainConsumer).singleton().proxy(),
            chainInterceptor: asClass(ChainInterceptor).singleton().proxy(),
        });
    }

    registerRouters() {
        super.registerRouters();

        this.container.register({
            httpRouter: asClass(HttpRouter).proxy(),
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
            // userChainConsumer is now registered in registerResultChains()
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

    registerInterceptors() {
        super.registerInterceptors();

        this.container.register({
            // chainInterceptor is now registered in registerResultChains()
            promotionBetInterceptor: asClass(CascadingSlotPromotionInterceptor).singleton().proxy(),
        });
    }

    registerInterceptorArrays() {
        this.container.register({
            betEventInterceptors: asFunction(() => {
                const interceptors = [];

                const promotionBetInterceptor = this.container.resolve("promotionBetInterceptor");
                if (promotionBetInterceptor) {
                    interceptors.push(promotionBetInterceptor);
                }

                const chainInterceptor = this.container.resolve("chainInterceptor");
                if (chainInterceptor) {
                    interceptors.push(chainInterceptor);
                }

                return interceptors;
            }).singleton(),
        });
    }
}
