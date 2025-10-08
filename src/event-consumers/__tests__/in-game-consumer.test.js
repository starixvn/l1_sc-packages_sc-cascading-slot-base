import { stub } from "jest-micro-auto-stub";
import { BaseEventPublishers, RoundQuery } from "sc-game-base/src/core";
import GameManagementApiClientFactory from "sc-game-base/src/core/game-management-api";
import { EventConsumers } from "sc-slot-game-base";
import { FreeSpinsConsumer } from "sc-slot-game-base/src/event-consumers/free-spins-consumer";
import SlotGameData from "sc-slot-game-base/src/slot-game-data";
import SlotGameDefinition from "sc-slot-game-base/src/slot-game-definition";
import InGameConsumer from "../in-game-consumer";

// Test data factories
class TestDataFactory {
    static createGameDefinition() {
        return new SlotGameDefinition({ id: 47 });
    }

    static createGameData(overrides = {}) {
        const result = new SlotGameData();
        
        result.remainingTime = 20;
        result.gameConfigs = {
            enabled: true,
            cascadingSlotsConfig: {
                betLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                betMultiplier: 20,
                oddsByCounts: [{ from: 8, to: 9, odds: 1 }],
                freeSpins: {
                    initialOdds: [],
                    additionalOdds: [],
                },
                features: {
                    buyFreeSpins: {
                        enabled: true,
                        multiplier: 2,
                        ...overrides.buyFreeSpins,
                    },
                    ...overrides.features,
                },
                ...overrides.cascadingSlotsConfig,
            },
            ...overrides.gameConfigs,
        };

        result.exchangeRates = { code: { UUS: 2 } };
        result.currencyGroupGames = [
            {
                groupId: "617a650628b7a500016388f5",
                coinValues: [1, 2, 5, 10, 50, 100],
                maxWinPerRound: 5000,
                defaultCoinValue: 1,
            },
        ];

        result.ingame = { player1: { totalMultiplier: 10 } };

        return result;
    }

    static createRealPlayer(overrides = {}) {
        return {
            session: {
                currencyGroupId: "617a650628b7a500016388f5",
                currencyCode: "UUS",
                multiplier: 2,
                operatorId: "operator1",
                siteName: "site1",
                ...overrides.session,
            },
            profile: {
                name: "player1",
                ...overrides.profile,
            },
            ...overrides,
        };
    }

    static createFreeSpinSet(overrides = {}) {
        return {
            betLevel: 2,
            coinValue: 10,
            betMultiplier: 20,
            ...overrides,
        };
    }
}

// Expected payload builders
class PayloadBuilder {
    static createBaseGameConfigs() {
        return {
            betLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            betMultiplier: 20,
            odds: {
                symbols: [{ from: 8, to: 9, odds: 1 }],
                freeSpins: {
                    initialOdds: [],
                    additionalOdds: [],
                },
            },
        };
    }

    static createBaseFreeSpins() {
        return {
            total: 10,
            buyFreeSpins: false,
        };
    }

    static createBaseUser() {
        return {
            rate: 4,
            multiplier: 2,
        };
    }

    static createBaseFeatures() {
        return {
            buyFreeSpins: {
                enabled: true,
                multiplier: 2,
            },
        };
    }

    static createExpectedPayload(overrides = {}) {
        return {
            gameConfigs: {
                ...PayloadBuilder.createBaseGameConfigs(),
                ...overrides.gameConfigs,
            },
            freeSpins: {
                ...PayloadBuilder.createBaseFreeSpins(),
                ...overrides.freeSpins,
            },
            totalMultiplier: overrides.totalMultiplier ?? 10,
            user: {
                ...PayloadBuilder.createBaseUser(),
                ...overrides.user,
            },
            features: {
                ...PayloadBuilder.createBaseFeatures(),
                ...overrides.features,
            },
            ...overrides.additional,
        };
    }
}

// Mock setup helper
class MockSetupHelper {
    static setupBasicMocks() {
        const freeSpinsConsumer = stub(FreeSpinsConsumer);
        const getBalance = jest.fn();
        const gameManagementApiClientFactory = stub(GameManagementApiClientFactory);
        const userTrackingClient = { signIn: jest.fn(() => {}) };
        
        const gameManagementApiClient = {
            users: {
                setBalance: jest.fn(() => Promise.resolve({ isOk: true })),
                getUserInfo: jest.fn(() => Promise.resolve({ isOk: true })),
            },
        };
        
        // Setup promotion API client with proper mock structure
        const promotionApiClientInstance = { getTOProgress: jest.fn(() => Promise.resolve({})) };
        const gamePromotionApiClient = { instance: jest.fn(() => promotionApiClientInstance) };
        
        gameManagementApiClientFactory.instance.mockReturnValue(gameManagementApiClient);
        getBalance.mockResolvedValue({ isOk: true, response: { red: 100 } });
        freeSpinsConsumer.getTotalAvaiableFreeSpins.mockReturnValue(10);

        return {
            freeSpinsConsumer,
            getBalance,
            gameManagementApiClientFactory,
            gamePromotionApiClient,
            userTrackingClient,
        };
    }
}

describe("InGameConsumer", () => {
    let consumer;
    let mocks;
    let gameData;

    beforeEach(() => {
        // Arrange - Setup mocks and test data
        jest.clearAllMocks();
        mocks = MockSetupHelper.setupBasicMocks();
        gameData = TestDataFactory.createGameData();
        
        consumer = new InGameConsumer({
            definition: TestDataFactory.createGameDefinition(),
            gameData,
            roundQuery: stub(RoundQuery),
            publisher: stub(BaseEventPublishers),
            freeSpinsConsumer: mocks.freeSpinsConsumer,
            getBalance: mocks.getBalance,
            gameManagementApiClientFactory: mocks.gameManagementApiClientFactory,
            userTrackingClient: mocks.userTrackingClient,
            gamePromotionApiClient: mocks.gamePromotionApiClient,
        });
    });

    describe("constructor", () => {
        it("should inherit from EventConsumers.InGameConsumer", () => {
            // Act & Assert
            expect(consumer instanceof EventConsumers.InGameConsumer).toBe(true);
        });
    });

    describe("buildPayload", () => {
        describe("when player does not have currency group game settings", () => {
            it("should return undefined values for coinValues, maxWinPerRound, and defaultCoinValue", async () => {
                // Arrange
                const realPlayer = TestDataFactory.createRealPlayer({
                    session: { 
                        currencyGroupId: "non-existent-id",
                        currencyCode: "UUS",
                        multiplier: 2,
                    },
                });
                mocks.freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValue(null);
                const expectedPayload = PayloadBuilder.createExpectedPayload({
                    gameConfigs: {
                        coinValues: undefined,
                        maxWinPerRound: undefined,
                        defaultCoinValue: undefined,
                        bigWinRange: [undefined, undefined, undefined],
                    },
                    freeSpins: {
                        betLevel: undefined,
                        coinValue: undefined,
                        betMultiplier: undefined,
                    },
                });

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result).toStrictEqual(expectedPayload);
            });
        });

        describe("when player has currency group game settings", () => {
            it("should include coinValues and maxWinPerRound when free spin has no buyFreeSpinRefRoundId", async () => {
                // Arrange
                const realPlayer = TestDataFactory.createRealPlayer({ profile: { name: "player2" } });
                const freeSpinSet = TestDataFactory.createFreeSpinSet();
                mocks.freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValue(freeSpinSet);
                const expectedPayload = PayloadBuilder.createExpectedPayload({
                    gameConfigs: {
                        coinValues: [1, 2, 5, 10, 50, 100],
                        maxWinPerRound: 5000,
                        defaultCoinValue: 1,
                        bigWinRange: [undefined, undefined, undefined],
                    },
                    freeSpins: {
                        betLevel: 2,
                        coinValue: 10,
                        betMultiplier: 20,
                    },
                    totalMultiplier: 0,
                });

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result).toStrictEqual(expectedPayload);
            });

            it("should set buyFreeSpins to true when free spin has buyFreeSpinRefRoundId", async () => {
                // Arrange
                const realPlayer = TestDataFactory.createRealPlayer({ profile: { name: "player2" } });
                const freeSpinSet = TestDataFactory.createFreeSpinSet({ buyFreeSpinRefRoundId: 10 });
                mocks.freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValue(freeSpinSet);
                const expectedPayload = PayloadBuilder.createExpectedPayload({
                    gameConfigs: {
                        coinValues: [1, 2, 5, 10, 50, 100],
                        maxWinPerRound: 5000,
                        defaultCoinValue: 1,
                        bigWinRange: [undefined, undefined, undefined],
                    },
                    freeSpins: {
                        betLevel: 2,
                        coinValue: 10,
                        betMultiplier: 20,
                        buyFreeSpins: true,
                    },
                    totalMultiplier: 0,
                });

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result).toStrictEqual(expectedPayload);
            });
        });

        describe("when buy free spins feature is configured", () => {
            it("should set buyFreeSpins enabled to false when feature is disabled", async () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.features.buyFreeSpins.enabled = false;
                const realPlayer = TestDataFactory.createRealPlayer();

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result.features.buyFreeSpins.enabled).toBe(false);
            });

            it("should set buyFreeSpins enabled to false when site is excluded", async () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.features.buyFreeSpins.siteExclusions = [
                    { operatorId: "operator1", sites: ["site1"] }
                ];
                const realPlayer = TestDataFactory.createRealPlayer();

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result.features.buyFreeSpins.enabled).toBe(false);
            });

            it("should set buyFreeSpins enabled to true when site is not excluded", async () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.features.buyFreeSpins.siteExclusions = [
                    { operatorId: "operator1", sites: ["different-site"] }
                ];
                const realPlayer = TestDataFactory.createRealPlayer();

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result.features.buyFreeSpins.enabled).toBe(true);
            });

            it("should set buyFreeSpins enabled to true when siteExclusions is undefined", async () => {
                // Arrange
                delete gameData.gameConfigs.cascadingSlotsConfig.features.buyFreeSpins.siteExclusions;
                const realPlayer = TestDataFactory.createRealPlayer();

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result.features.buyFreeSpins.enabled).toBe(true);
            });
        });

        describe("when player has promotion data", () => {
            it("should include promotion in payload when player has promotion but no promotionTOProgress", async () => {
                // Arrange
                const promotion = { promotionId: "promo123", type: "bonus" };
                const realPlayer = TestDataFactory.createRealPlayer({ promotion });

                // Act
                const result = await consumer.buildPayload(realPlayer);

                // Assert
                expect(result.promotion).toEqual(promotion);
            });

            it("should include promotionTOProgress when player has it", async () => {
                // Arrange
                const promotion = { promotionId: "promo123" };
                const realPlayer = TestDataFactory.createRealPlayer({
                    promotion,
                    promotionTOProgress: {
                        totalTurnover: 100,
                        minRequiredTurnover: 200,
                        remainingTO: 100,
                        progressPercentage: 50,
                        canClaim: false,
                        totalWinAmount: 25,
                        claimExpirationDate: "2023-12-31",
                    },
                });
                const promotionTOProgress = {
                    totalTurnover: 150,
                    minRequiredTurnover: 200,
                    remainingTO: 50,
                    progressPercentage: 75,
                    canClaim: false,
                    totalWinAmount: 35,
                    claimExpirationDate: "2023-12-31",
                };
                
                // Create a new consumer with proper promotion API client mock
                const promotionApiClientInstance = { getTOProgress: jest.fn(() => Promise.resolve(promotionTOProgress)) };
                const gamePromotionApiClient = { instance: jest.fn(() => promotionApiClientInstance) };
                const tempConsumer = new InGameConsumer({
                    definition: TestDataFactory.createGameDefinition(),
                    gameData,
                    roundQuery: stub(RoundQuery),
                    publisher: stub(BaseEventPublishers),
                    freeSpinsConsumer: mocks.freeSpinsConsumer,
                    getBalance: mocks.getBalance,
                    gameManagementApiClientFactory: mocks.gameManagementApiClientFactory,
                    userTrackingClient: mocks.userTrackingClient,
                    gamePromotionApiClient,
                });

                // Act
                const result = await tempConsumer.buildPayload(realPlayer);

                // Assert
                expect(result.promotionTOProgress.totalTO).toBe(150);
                expect(result.promotionTOProgress.minTO).toBe(200);
                expect(result.promotionTOProgress.remainTO).toBe(50);
                expect(result.promotionTOProgress.progress).toBe(75);
                expect(result.promotionTOProgress.canClaim).toBe(false);
                expect(result.promotionTOProgress.win).toBe(35);
                expect(result.promotionTOProgress.expire).toBe("2023-12-31");
                expect(result.promotionTOProgress.promotionId).toBe("promo123");
            });
        });
    });

    describe("getAvailableFreeSpins", () => {
        it("should return total free spins and soonest expired free spin details", () => {
            // Arrange
            const realPlayer = TestDataFactory.createRealPlayer();
            const expectedFreeSpinSet = TestDataFactory.createFreeSpinSet({ promotionId: "promo123" });
            mocks.freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValue(expectedFreeSpinSet);

            // Act
            const result = consumer.getAvailableFreeSpins(realPlayer);

            // Assert
            expect(result.total).toBe(10);
            expect(result.betLevel).toBe(2);
            expect(result.coinValue).toBe(10);
            expect(result.betMultiplier).toBe(20);
            expect(result.promotionId).toBe("promo123");
        });

        it("should return undefined values when no soonest expired free spin exists", () => {
            // Arrange
            const realPlayer = TestDataFactory.createRealPlayer();
            mocks.freeSpinsConsumer.getSoonestExpiredFreeSpinSet.mockReturnValue(null);

            // Act
            const result = consumer.getAvailableFreeSpins(realPlayer);

            // Assert
            expect(result.total).toBe(10);
            expect(result.betLevel).toBeUndefined();
            expect(result.coinValue).toBeUndefined();
            expect(result.betMultiplier).toBeUndefined();
            expect(result.promotionId).toBeUndefined();
        });
    });

    describe("updatePromotionTOProgress", () => {
        it("should update realPlayer promotionTOProgress with API response", async () => {
            // Arrange
            const promotion = { promotionId: "promo123" };
            const realPlayer = TestDataFactory.createRealPlayer({ promotion });
            const apiResponse = {
                totalTurnover: 150,
                minRequiredTurnover: 200,
                remainingTO: 50,
                progressPercentage: 75,
                canClaim: true,
                totalWinAmount: 35,
                claimExpirationDate: "2023-12-31",
            };
            const promotionApiClientInstance = { getTOProgress: jest.fn(() => Promise.resolve(apiResponse)) };
            const gamePromotionApiClient = { instance: jest.fn(() => promotionApiClientInstance) };
            const tempConsumer = new InGameConsumer({
                definition: TestDataFactory.createGameDefinition(),
                gameData,
                roundQuery: stub(RoundQuery),
                publisher: stub(BaseEventPublishers),
                freeSpinsConsumer: mocks.freeSpinsConsumer,
                getBalance: mocks.getBalance,
                gameManagementApiClientFactory: mocks.gameManagementApiClientFactory,
                userTrackingClient: mocks.userTrackingClient,
                gamePromotionApiClient,
            });

            // Act
            await tempConsumer.updatePromotionTOProgress(realPlayer);

            // Assert
            expect(realPlayer.promotionTOProgress.totalTurnover).toBe(150);
            expect(realPlayer.promotionTOProgress.minRequiredTurnover).toBe(200);
            expect(realPlayer.promotionTOProgress.remainingTO).toBe(50);
            expect(realPlayer.promotionTOProgress.progressPercentage).toBe(75);
            expect(realPlayer.promotionTOProgress.canClaim).toBe(true);
            expect(realPlayer.promotionTOProgress.totalWinAmount).toBe(35);
            expect(realPlayer.promotionTOProgress.claimExpirationDate).toBe("2023-12-31");
        });

        it("should call promotionApiClient getTOProgress with correct parameters", async () => {
            // Arrange
            const promotion = { promotionId: "promo123" };
            const realPlayer = TestDataFactory.createRealPlayer({ 
                promotion,
                session: { 
                    playerId: "player456", 
                    operatorId: "op789", 
                    siteName: "testsite",
                    currencyGroupId: "617a650628b7a500016388f5",
                    currencyCode: "UUS",
                    multiplier: 2,
                }
            });
            const promotionApiClientInstance = { 
                getTOProgress: jest.fn(() => Promise.resolve({
                    totalTurnover: 0, minRequiredTurnover: 0, remainingTO: 0,
                    progressPercentage: 0, canClaim: false, totalWinAmount: 0,
                    claimExpirationDate: null
                })) 
            };
            const gamePromotionApiClient = { instance: jest.fn(() => promotionApiClientInstance) };
            const tempConsumer = new InGameConsumer({
                definition: TestDataFactory.createGameDefinition(),
                gameData,
                roundQuery: stub(RoundQuery),
                publisher: stub(BaseEventPublishers),
                freeSpinsConsumer: mocks.freeSpinsConsumer,
                getBalance: mocks.getBalance,
                gameManagementApiClientFactory: mocks.gameManagementApiClientFactory,
                userTrackingClient: mocks.userTrackingClient,
                gamePromotionApiClient,
            });

            // Act
            await tempConsumer.updatePromotionTOProgress(realPlayer);

            // Assert
            expect(promotionApiClientInstance.getTOProgress).toHaveBeenCalledWith({
                promotionId: "promo123",
                playerId: "player456",
                operatorId: "op789",
                siteName: "testsite",
            });
        });
    });
});
