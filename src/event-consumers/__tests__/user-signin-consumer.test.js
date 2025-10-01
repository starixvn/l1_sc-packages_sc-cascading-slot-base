import { stub } from "jest-micro-auto-stub";
import { Table } from "sc-game-base";
import UserSignInConsumer from "../user-signin-consumer";

// Mock the parent class
const mockTableUserSignInConsumer = {
    constructor: jest.fn(),
    extendPromo: jest.fn(),
    getDefaultBetLevel: jest.fn(),
};

// Mock Table.EventConsumers.TableUserSignInConsumer
jest.mock("sc-game-base", () => ({
    Table: {
        EventConsumers: {
            TableUserSignInConsumer: class MockTableUserSignInConsumer {
                constructor(dependencies) {
                    mockTableUserSignInConsumer.constructor(dependencies);
                    // Set gameData property that the child class expects
                    if (dependencies && dependencies.gameData) {
                        this.gameData = dependencies.gameData;
                    }
                }
            },
        },
    },
}));

// Test data factories for DRY setup
class UserSignInConsumerTestFactory {
    static createGameData(overrides = {}) {
        return {
            gameConfigs: {
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
                        },
                    },
                    ...overrides.cascadingSlotsConfig,
                },
                ...overrides.gameConfigs,
            },
            exchangeRates: { code: { USD: 1, EUR: 0.85 } },
            currencyGroupGames: [
                {
                    groupId: "617a650628b7a500016388f5",
                    coinValues: [1, 2, 5, 10, 50, 100],
                    maxWinPerRound: 5000,
                    defaultCoinValue: 1,
                },
            ],
            ...overrides,
        };
    }

    static createBaseData(overrides = {}) {
        return {
            promotionId: "promo123",
            freeSpinsAmount: 10,
            expirationDate: "2023-12-31T23:59:59.999Z",
            type: "sign-in-bonus",
            multiplier: 1,
            ...overrides,
        };
    }

    static createOriginalPromotion(overrides = {}) {
        return {
            promotionId: "promo123",
            coinValue: 5,
            type: "sign-in-bonus",
            description: "Daily sign-in bonus",
            ...overrides,
        };
    }

    static createDependencies(overrides = {}) {
        return {
            gameData: this.createGameData(),
            definition: { id: 47, name: "cascading-game" },
            logService: {
                logInfo: jest.fn(),
                logWarning: jest.fn(),
                logError: jest.fn(),
                logDebug: jest.fn(),
            },
            ...overrides,
        };
    }

    static createCustomBetLevels(betLevels) {
        return this.createGameData({
            gameConfigs: {
                cascadingSlotsConfig: {
                    betLevels,
                },
            },
        });
    }
}

// Expected result builders
class ExpectedResultBuilder {
    static createExtendedPromo(baseData, originalPromotion, betLevel) {
        return {
            ...baseData,
            betLevel,
            coinValue: originalPromotion.coinValue,
        };
    }
}

describe("UserSignInConsumer", () => {
    let consumer;
    let gameData;

    beforeEach(() => {
        // Arrange - Setup test data and consumer instance
        jest.clearAllMocks();
        mockTableUserSignInConsumer.constructor.mockClear();
        gameData = UserSignInConsumerTestFactory.createGameData();
        
        consumer = new UserSignInConsumer({
            gameData,
            definition: { id: 47, name: "cascading-game" },
        });
    });

    describe("constructor", () => {
        it("should inherit from Table.EventConsumers.TableUserSignInConsumer", () => {
            // Act & Assert
            expect(consumer instanceof Table.EventConsumers.TableUserSignInConsumer).toBe(true);
        });

        it("should set gameData property", () => {
            // Arrange
            const customGameData = UserSignInConsumerTestFactory.createGameData({ customProp: "test" });
            
            // Act
            const newConsumer = new UserSignInConsumer({ gameData: customGameData });

            // Assert
            expect(newConsumer.gameData).toBe(customGameData);
        });

        it("should initialize with provided dependencies", () => {
            // Arrange
            const dependencies = UserSignInConsumerTestFactory.createDependencies();
            
            // Act
            const newConsumer = new UserSignInConsumer(dependencies);

            // Assert
            expect(newConsumer.gameData).toBe(dependencies.gameData);
        });
    });

    describe("extendPromo", () => {
        describe("when extending promotion with base data", () => {
            it("should include all properties from baseData", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData({
                    promotionId: "special123",
                    freeSpinsAmount: 15,
                    customProperty: "customValue",
                });
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.promotionId).toBe("special123");
                expect(result.freeSpinsAmount).toBe(15);
                expect(result.customProperty).toBe("customValue");
            });

            it("should include betLevel from getDefaultBetLevel", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData();
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.betLevel).toBe(1);
            });

            it("should include coinValue from originalPromotion", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData();
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({ coinValue: 25 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(25);
            });

            it("should override baseData properties when they conflict with betLevel", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData({ betLevel: 999 });
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.betLevel).toBe(1);
            });

            it("should override baseData properties when they conflict with coinValue", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData({ coinValue: 999 });
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({ coinValue: 50 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(50);
            });
        });

        describe("when originalPromotion has different coinValue", () => {
            it("should use coinValue of 1 when originalPromotion has coinValue 1", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData();
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({ coinValue: 1 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(1);
            });

            it("should use coinValue of 100 when originalPromotion has coinValue 100", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData();
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({ coinValue: 100 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(100);
            });

            it("should handle decimal coinValue correctly", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData();
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({ coinValue: 0.5 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(0.5);
            });
        });

        describe("when baseData contains complex nested properties", () => {
            it("should preserve nested objects in baseData", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData({
                    metadata: {
                        source: "daily-signin",
                        timestamp: Date.now(),
                        features: ["bonus", "multiplier"],
                    },
                });
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.metadata.source).toBe("daily-signin");
                expect(result.metadata.features).toEqual(["bonus", "multiplier"]);
            });

            it("should preserve arrays in baseData", () => {
                // Arrange
                const baseData = UserSignInConsumerTestFactory.createBaseData({
                    eligibleGames: ["cascading-slots", "poker", "blackjack"],
                });
                const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.eligibleGames).toEqual(["cascading-slots", "poker", "blackjack"]);
            });
        });
    });

    describe("getDefaultBetLevel", () => {
        describe("when cascadingSlotsConfig has betLevels", () => {
            it("should return first betLevel when betLevels starts with 1", () => {
                // Arrange
                consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [1, 2, 3, 4, 5];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(1);
            });

            it("should return first betLevel when betLevels starts with 5", () => {
                // Arrange
                consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [5, 10, 15, 20];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(5);
            });

            it("should return first betLevel when betLevels starts with 0", () => {
                // Arrange
                consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [0, 1, 2, 3];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(0);
            });

            it("should return first betLevel when betLevels has only one element", () => {
                // Arrange
                consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [42];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(42);
            });

            it("should return first betLevel when betLevels are in descending order", () => {
                // Arrange
                consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [10, 8, 6, 4, 2];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(10);
            });

            it("should return first betLevel when betLevels contains decimal values", () => {
                // Arrange
                consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [0.5, 1, 2.5, 5];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(0.5);
            });
        });

        describe("when cascadingSlotsConfig betLevels is empty", () => {
            it("should return undefined when betLevels array is empty", () => {
                // Arrange
                consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBeUndefined();
            });
        });

        describe("when cascadingSlotsConfig has different configurations", () => {
            it("should access betLevels through correct path", () => {
                // Arrange
                consumer.gameData = {
                    gameConfigs: {
                        cascadingSlotsConfig: {
                            betLevels: [7, 14, 21, 28],
                            otherProperty: "ignored",
                        },
                        otherConfig: {
                            betLevels: [999], // Should not be accessed
                        },
                    },
                };

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(7);
            });
        });
    });

    describe("integration scenarios", () => {
        it("should use correct betLevel in extendPromo when gameData has custom betLevels", () => {
            // Arrange
            consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [3, 6, 9, 12];
            const baseData = UserSignInConsumerTestFactory.createBaseData();
            const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion();
            const expectedResult = ExpectedResultBuilder.createExtendedPromo(baseData, originalPromotion, 3);

            // Act
            const result = consumer.extendPromo(baseData, originalPromotion);

            // Assert
            expect(result).toEqual(expectedResult);
        });

        it("should handle complete promotion extension with all custom values", () => {
            // Arrange
            consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [2, 4, 8, 16];
            const baseData = UserSignInConsumerTestFactory.createBaseData({
                promotionId: "signin-bonus-2024",
                freeSpinsAmount: 20,
                expirationDate: "2024-01-31T23:59:59.999Z",
                type: "daily-signin",
                customProperty: "special-value",
            });
            const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({
                coinValue: 15,
                description: "New Year Sign-in Bonus",
            });

            // Act
            const result = consumer.extendPromo(baseData, originalPromotion);

            // Assert
            expect(result.promotionId).toBe("signin-bonus-2024");
            expect(result.freeSpinsAmount).toBe(20);
            expect(result.expirationDate).toBe("2024-01-31T23:59:59.999Z");
            expect(result.type).toBe("daily-signin");
            expect(result.customProperty).toBe("special-value");
            expect(result.betLevel).toBe(2);
            expect(result.coinValue).toBe(15);
        });

        it("should work correctly when betLevel changes dynamically", () => {
            // Arrange
            const baseData = UserSignInConsumerTestFactory.createBaseData();
            const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion();
            
            // First extension with default betLevels
            const firstResult = consumer.extendPromo(baseData, originalPromotion);
            
            // Change betLevels
            consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [25, 50, 75, 100];
            
            // Act
            const secondResult = consumer.extendPromo(baseData, originalPromotion);

            // Assert
            expect(firstResult.betLevel).toBe(1);
            expect(secondResult.betLevel).toBe(25);
        });

        it("should handle edge case with zero betLevel", () => {
            // Arrange
            consumer.gameData.gameConfigs.cascadingSlotsConfig.betLevels = [0, 5, 10];
            const baseData = UserSignInConsumerTestFactory.createBaseData();
            const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({ coinValue: 10 });

            // Act
            const result = consumer.extendPromo(baseData, originalPromotion);

            // Assert
            expect(result.betLevel).toBe(0);
            expect(result.coinValue).toBe(10);
        });

        it("should preserve all baseData properties while adding required fields", () => {
            // Arrange
            const complexBaseData = {
                promotionId: "complex-promo",
                freeSpinsAmount: 30,
                expirationDate: "2024-06-30T23:59:59.999Z",
                type: "signin-bonus",
                multiplier: 2,
                metadata: {
                    campaign: "summer2024",
                    eligibility: ["new-users", "returning-users"],
                },
                rules: {
                    maxPerDay: 1,
                    requiresVerification: true,
                },
                existingBetLevel: 999, // Should be overridden
                existingCoinValue: 888, // Should be overridden
            };
            const originalPromotion = UserSignInConsumerTestFactory.createOriginalPromotion({ coinValue: 25 });

            // Act
            const result = consumer.extendPromo(complexBaseData, originalPromotion);

            // Assert
            expect(result.promotionId).toBe("complex-promo");
            expect(result.freeSpinsAmount).toBe(30);
            expect(result.metadata.campaign).toBe("summer2024");
            expect(result.rules.maxPerDay).toBe(1);
            expect(result.betLevel).toBe(1); // Overridden
            expect(result.coinValue).toBe(25); // Overridden
        });
    });
});
