import { stub } from "jest-micro-auto-stub";
import CascadingBoardGenerator from "../cascading-board-generator";
import { gameConfigs } from "../../test-data";
import { logger } from "sc-common";
import { BoardGenerator } from "sc-slot-board-generator";

import Chance from "chance";
import defaultDefinition from "../../board/default-definition";

jest.mock("sc-common");

describe("CascadingBoardGenerator", () => {
    let cascadingBoardGenerator;

    const chance = new Chance();

    const definition = {
        durations: {
            wholeRound: 60,
        },
    };
    const gameData = {
        roundId: chance.natural(),
        gameConfigs: gameConfigs,
    };

    const stubSlotBoardGenerator = stub(BoardGenerator);

    beforeEach(() => {
        cascadingBoardGenerator = new CascadingBoardGenerator(definition, gameData, defaultDefinition.boardSettings, logger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("initialize", () => {
        it("always init board with multiplier bonus from game config", () => {
            // Arrange

            // Act
            cascadingBoardGenerator.initialize();

            // Assert
            const multiplierConfig = cascadingBoardGenerator.boardGenerator.getMultiplierConfig();
            expect(multiplierConfig).toStrictEqual(gameConfigs.cascadingSlotsConfig.multiplierBonus);
        });

        it("always init board with difficulty from game config", () => {
            // Act
            cascadingBoardGenerator.initialize();

            // Assert
            const difficulty = cascadingBoardGenerator.boardGenerator.getDifficulty();
            expect(difficulty).toStrictEqual(gameConfigs.cascadingSlotsConfig.mode);
        });
    });

    describe("generate", () => {
        beforeEach(() => {
            cascadingBoardGenerator.boardGenerator = stubSlotBoardGenerator;
        });

        it("always call slot board generator", () => {
            // Act
            cascadingBoardGenerator.generate();

            // Assert
            expect(stubSlotBoardGenerator.generate).toBeCalled();
        });
    });

    describe("explodeAndRefill", () => {
        beforeEach(() => {
            cascadingBoardGenerator.boardGenerator = stubSlotBoardGenerator;
        });

        it("always call slot board generator with assigned parameters", () => {
            // Act
            cascadingBoardGenerator.explodeAndRefill([1, 2, 3, 4, 5], [1], []);

            // Assert
            expect(stubSlotBoardGenerator.explodeAndRefill).toBeCalledWith([1, 2, 3, 4, 5], [1], []);
        });

        it("always return results from slot board generator", () => {
            // Arrange
            stubSlotBoardGenerator.explodeAndRefill.mockReturnValueOnce([2, 3, 4, 5, 6]);

            // Act
            const result = cascadingBoardGenerator.explodeAndRefill([1, 2, 3, 4, 5], [1], []);

            // Assert
            expect(result).toStrictEqual([2, 3, 4, 5, 6]);
        });
    });

    describe("setRefillSymbols", () => {
        beforeEach(() => {
            cascadingBoardGenerator.boardGenerator = stubSlotBoardGenerator;
        });

        it("always call slot board generator with assigned parameters", () => {
            // Act
            cascadingBoardGenerator.setRefillSymbols([1], [2]);

            // Assert
            expect(stubSlotBoardGenerator.setRefillSymbols).toBeCalledWith([1], [2]);
        });
    });
});
