import { stub, stubMongoose } from "jest-micro-auto-stub";
import mongoose from "mongoose";
import { UserBetResultPublisher } from "sc-game-base/src/core/event-publishers";
import GameManagementApiClientFactory from "sc-game-base/src/core/game-management-api";
import { EventInterceptors } from "sc-slot-game-base";
import defaultDefinition from "../../board/default-definition";
import ChainManager from "../../board/chain-manager";
import RoundCalculator from "../../board/round-calculator";
import TumbleCalculator from "../../board/tumble-calculator";
import { definition, gameConfigs } from "../../test-data";
import FreeSpinsConsumer from "../free-spins-consumer";
import SettleGameRoundConsumer from "../settle-game-round-consumer";
import TotalMultiplierConsumer from "../total-multiplier-consumer";

const currencyGroupSetting = {
    groupId: "g1",
    maxWinPerRound: 100,
};
const gameData = {
    gameConfigs,
    currencyGroupGames: [currencyGroupSetting],
    settlementResultFromAdmin: {},
};

const userBetResultPublisher = stub(UserBetResultPublisher);
const boardGenerator = {
    initialize: jest.fn(),
    generate: jest.fn(),
    explodeAndRefill: jest.fn(),
};

// Mock the boardGenerator.initialize() to return a mock BoardGenerator instance
const mockBoardGeneratorInstance = {
    generate: jest.fn(),
    explodeAndRefill: jest.fn(),
    setRefillSymbols: jest.fn(),
    setDifficulty: jest.fn(),
    updateMultiplierConfig: jest.fn(),
    getMultiplierConfig: jest.fn(),
    getDifficulty: jest.fn(),
};

boardGenerator.initialize.mockReturnValue(mockBoardGeneratorInstance);

const freeSpinsConsumer = stub(FreeSpinsConsumer);

const totalMultiplierConsumer = stub(TotalMultiplierConsumer);

const tumbleCalculator = new TumbleCalculator();
const endGame = jest.fn(() => ({ isOk: true }));

const player = {
    profile: {
        name: "player01",
    },
    session: {
        currencyGroupId: "g1",
    },
};
const roundsRepository = stubMongoose(mongoose.Model);
const roundCalculator = new RoundCalculator({ boardGenerator, tumbleCalculator });

const gameManagementApiClientFactory = stub(GameManagementApiClientFactory);
const gameManagementApiClient = {
    users: {
        updateBalance: jest.fn(() => Promise.resolve({ isOk: true })),
    },
};
gameManagementApiClientFactory.instance.mockReturnValue(gameManagementApiClient);

const promotionBetInterceptor = stub(EventInterceptors.SlotPromotionInterceptor);
const resultChainManager = stub(ChainManager);

function initConsumer() {
    return new SettleGameRoundConsumer({
        definition,
        gameData,
        roundResultPublisher: userBetResultPublisher,
        userBetResultPublisher,
        freeSpinsConsumer,
        endGame,
        roundsRepository,
        betsRepository: roundsRepository,
        totalMultiplierConsumer,
        roundCalculator,
        gameManagementApiClientFactory,
        logService: { logInfo: jest.fn(), logWarning: jest.fn(), logError: jest.fn() },
        resultChainManager,
    });
}

function initRoundDocument({ id = 1, playerId, coinValue, betLevel, betMultiplier, freeSpin }) {
    return {
        id,
        coinValue,
        betLevel,
        betMultiplier,
        totalAmount: coinValue * betLevel * betMultiplier,
        paid: false,
        rate: 1,
        exchangeRateId: 1,
        playerId,
        odds: gameConfigs.cascadingSlotsConfig,
        betwin: 0,
        freeSpin,
        multiplier: 0,
        totalMultiplier: 0,
        save: jest.fn(),
    };
}

describe("settle round", () => {
    describe("settle normal spin", () => {
        describe("when having winning icons", () => {
            beforeAll(() => {
                const baseBoard = [8, 8, 8, 3, 8, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7];
                const newBoardAfterExplode = [0, 1, 2, 3, 8, 10, 6, 4, 0, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
                mockBoardGeneratorInstance.explodeAndRefill.mockReturnValue({
                    explodedSymbols: [],
                    newSymbols: [],
                    multipliers: [2, 2],
                    newBoard: newBoardAfterExplode,
                });
            });
            it("should calcualte betwin correctly", async () => {
                //Arange
                const consumer = initConsumer();
                const round = initRoundDocument({ playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20 });
                roundsRepository.findOne().exec.mockReturnValueOnce(round);

                //Act
                await consumer.settleRound(player, 1);

                //Assert
                expect(round.betwin).toEqual(round.coinValue * round.betLevel * 1.5 * 2 * 2);
            });

            it("betwin should be max win per round when it exceeds the value", async () => {
                //Arange
                const consumer = initConsumer();
                const round = initRoundDocument({ playerId: 1, coinValue: 1, betLevel: 10, betMultiplier: 20 });
                roundsRepository.findOne().exec.mockReturnValueOnce(round);
                currencyGroupSetting.maxWinPerRound = 0.3;

                //Act
                await consumer.settleRound(player, 1);

                //Assert
                expect(round.betwin).toEqual(currencyGroupSetting.maxWinPerRound * round.totalAmount);
                expect(round.reachMaxWin).toBe(true);
                currencyGroupSetting.maxWinPerRound = 100;
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
                mockBoardGeneratorInstance.explodeAndRefill.mockReset();
            });
        });
    });
    describe("settle free spin", () => {
        let round;

        beforeAll(() => {
            totalMultiplierConsumer.getCurrentMultiplier.mockReturnValue(2);
        });

        beforeEach(() => {
            round = initRoundDocument({ id: 2, playerId: 1, coinValue: 0.1, betLevel: 5, betMultiplier: 20, freeSpin: true });
            roundsRepository.findOne().exec.mockReturnValue(round);
        });

        describe("when having winning icons", () => {
            beforeAll(() => {
                const baseBoard = [8, 8, 8, 3, 8, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 10];
                const newBoardAfterExplode = [0, 1, 2, 3, 8, 10, 6, 4, 10, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 7];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
                mockBoardGeneratorInstance.explodeAndRefill.mockReturnValue({
                    explodedSymbols: [],
                    newSymbols: [],
                    multipliers: [2, 2],
                    newBoard: newBoardAfterExplode,
                });
            });

            it("should add multiplier to total multipliers", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.totalMultiplier).toEqual(6);
            });

            it("should calculate betwin with total multiplier", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.betwin).toEqual(0.1 * 5 * 1.5 * 6);
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
                mockBoardGeneratorInstance.explodeAndRefill.mockReset();
            });
        });

        describe("when not having winning icons", () => {
            beforeAll(() => {
                const baseBoard = [1, 0, 2, 3, 3, 10, 8, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 10];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
            });

            it("should not add multiplier to total multipliers", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.totalMultiplier).toEqual(2);
            });

            it("should not call total_multipliers consumer", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(totalMultiplierConsumer.increaseTotalMultiplier).not.toHaveBeenCalled();
            });

            afterEach(() => {
                jest.clearAllMocks();
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
                mockBoardGeneratorInstance.explodeAndRefill.mockReset();
            });
        });

        describe("when having extra free spins", () => {
            let freeSpinCount;
            beforeAll(() => {
                const baseBoard = [1, 0, 2, 3, 9, 10, 9, 8, 8, 9, 5, 9, 8, 2, 4, 9, 5, 4, 6, 2, 4, 6, 3, 8, 3, 1, 5, 6, 7, 10];
                mockBoardGeneratorInstance.generate.mockReturnValue({ newBoard: baseBoard, multipliers: [2, 2] });
                freeSpinCount = baseBoard.filter((x) => x === defaultDefinition.specialSymbols.freeSpins).length;
            });

            it("should calculate odds with additionalOdds", async () => {
                //Arange
                const consumer = initConsumer();

                //Act
                await consumer.settleRound(player, 2);

                //Assert
                expect(round.settlementResult.freeSpins.odds).toEqual(
                    gameConfigs.cascadingSlotsConfig.freeSpins.additionalOdds.find((x) => x.count === freeSpinCount).odds
                );
            });

            afterAll(() => {
                mockBoardGeneratorInstance.generate.mockReset();
            });
        });
    });
});

afterEach(() => {
    jest.clearAllMocks();
});
