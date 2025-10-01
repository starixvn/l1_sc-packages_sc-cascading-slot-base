import { logger } from "sc-common";
import { stub } from "jest-micro-auto-stub";
import CascadingBoardGenerator from "../../board/cascading-board-generator";
import TumbleCalculator from "../../board/tumble-calculator";
import { gameConfigs, definition } from "../../test-data";
import CascadingHttpRouter from "../cascading-http-router";
import defaultDefinition from "../../board/default-definition";

const prodAppConfigs = {
    sentry: {
        env: "PROD",
    },
};

const localAppConfigs = {
    sentry: {
        env: "LOCAL",
    },
};

const currencyGroupSetting = {
    groupId: "g1",
    maxWinPerRound: 1000,
};
const gameData = {
    gameConfigs,
    currencyGroupGames: [currencyGroupSetting],
    settlementResultFromAdmin: {},
};
const logService = stub(logger);
logger.logWarning = jest.fn();
logger.logError = jest.fn();

const tumbleCalculator = new TumbleCalculator();
const boardGenerator = new CascadingBoardGenerator(definition, gameData, defaultDefinition.boardSettings, logService);
boardGenerator.initialize();

const historyQuery = stub();
const metricQuery = stub();

const res = {
    send: jest.fn(),
};

function initRouter(appConfigs) {
    return new CascadingHttpRouter({ appConfigs, gameData, tumbleCalculator, boardGenerator, logService, historyQuery, metricQuery });
}

const validParams = {
    name: "Test",
    result: {
        base: {
            board: [9, 8, 8, 3, 0, 8, 8, 9, 8, 0, 0, 10, 9, 0, 8, 3, 10, 0, 0, 8, 8, 8, 8, 3, 3, 8, 0, 8, 9, 0],
            multipliers: [2, 2],
        },
        tumbles: [
            {
                newSymbols: [1, 2, 2, 1, 0, 1, 2, 2, 1, 0, 0, 10, 1, 0, 2, 0, 1, 0, 0, 1],
                multipliers: [3],
            },
        ],
    },
};

describe("handleSetBoard", () => {
    describe("PROD environment", () => {
        it("should not allow to set result and send no permission response", () => {
            //Arrange
            const router = initRouter(prodAppConfigs);

            //Act
            router.handleSetBoard({}, res);

            //Assert
            expect(res.send).toBeCalledWith({ noPermission: true });
        });
    });

    describe("non production environment", () => {
        describe("valid params", () => {
            it("should log warning to sentry", () => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(validParams, res);

                //Assert
                expect(logService.logWarning).toBeCalled();
            });

            it("should set result to game data", () => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(validParams, res);

                //Assert
                expect(Array.isArray(gameData.settlementResultFromAdmin[validParams.name])).toBe(true);
            });

            afterEach(() => {
                gameData.settlementResultFromAdmin = {};
            });
        });

        describe("invalid params", () => {
            const invalidParams = [null, {}, { name: "Test" }, { result: {} }];
            it.each(invalidParams)("should log to sentry", (params) => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(params, res);

                //Assert
                expect(logService.logError).toBeCalledWith("receives a result cheating call with invalid params.");
            });

            it.each(invalidParams)("should send response with error: true", (params) => {
                //Arrange
                const router = initRouter(localAppConfigs);

                //Act
                router.handleSetBoard(params, res);

                //Assert
                expect(res.send).toBeCalledWith({ error: true });
            });
        });
    });
});

describe("generateResultFromAdmin", () => {
    it("should return pregenerated result", () => {
        //Arrange
        const router = initRouter(localAppConfigs);

        //Act
        const result = router.generateResultFromAdmin(validParams.result);

        //Assert
        expect(result.length).toEqual(2);
    });
});

afterEach(() => {
    jest.clearAllMocks();
});
