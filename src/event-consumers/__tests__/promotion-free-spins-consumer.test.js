import { stub } from "jest-micro-auto-stub";
import { EventConsumers } from "sc-slot-game-base";
import SlotGameData from "sc-slot-game-base/src/slot-game-data";
import PromotionFreeSpinsConsumer from "../promotion-free-spins-consumer";

// Test data factories
class TestDataFactory {
    static createGameData(overrides = {}) {
        const result = new SlotGameData();
        
        result.gameConfigs = {
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
        };
        
        return result;
    }

    static createBaseData(overrides = {}) {
        return {
            promotionId: "promo123",
            freeSpinsAmount: 10,
            expirationDate: "2023-12-31T23:59:59.999Z",
            ...overrides,
        };
    }

    static createOriginalPromotion(overrides = {}) {
        return {
            promotionId: "promo123",
            coinValue: 5,
            type: "free-spins",
            ...overrides,
        };
    }

    static createCustomBetLevels(betLevels) {
        return {
            cascadingSlotsConfig: {
                betLevels,
            },
        };
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

// Mock setup helper
class MockSetupHelper {
    static setupBasicMocks() {
        return {
            // Add any additional mocks if needed in the future
        };
    }
}

describe("PromotionFreeSpinsConsumer", () => {
    let consumer;
    let gameData;

    beforeEach(() => {
        // Arrange - Setup test data and consumer instance
        jest.clearAllMocks();
        gameData = TestDataFactory.createGameData();
        
        consumer = new PromotionFreeSpinsConsumer({
            gameData,
        });
    });

    describe("constructor", () => {
        it("should inherit from EventConsumers.PromotionFreeSpinsConsumer", () => {
            // Act & Assert
            expect(consumer instanceof EventConsumers.PromotionFreeSpinsConsumer).toBe(true);
        });
    });

    describe("extendPromo", () => {
        describe("when extending promotion with base data", () => {
            it("should include all properties from baseData", () => {
                // Arrange
                const baseData = TestDataFactory.createBaseData();
                const originalPromotion = TestDataFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.promotionId).toBe("promo123");
                expect(result.freeSpinsAmount).toBe(10);
                expect(result.expirationDate).toBe("2023-12-31T23:59:59.999Z");
            });

            it("should include betLevel from getDefaultBetLevel", () => {
                // Arrange
                const baseData = TestDataFactory.createBaseData();
                const originalPromotion = TestDataFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.betLevel).toBe(1);
            });

            it("should include coinValue from originalPromotion", () => {
                // Arrange
                const baseData = TestDataFactory.createBaseData();
                const originalPromotion = TestDataFactory.createOriginalPromotion({ coinValue: 25 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(25);
            });

            it("should override baseData properties when they conflict with betLevel", () => {
                // Arrange
                const baseData = TestDataFactory.createBaseData({ betLevel: 999 });
                const originalPromotion = TestDataFactory.createOriginalPromotion();

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.betLevel).toBe(1);
            });

            it("should override baseData properties when they conflict with coinValue", () => {
                // Arrange
                const baseData = TestDataFactory.createBaseData({ coinValue: 999 });
                const originalPromotion = TestDataFactory.createOriginalPromotion({ coinValue: 50 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(50);
            });
        });

        describe("when originalPromotion has different coinValue", () => {
            it("should use coinValue of 1 when originalPromotion has coinValue 1", () => {
                // Arrange
                const baseData = TestDataFactory.createBaseData();
                const originalPromotion = TestDataFactory.createOriginalPromotion({ coinValue: 1 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(1);
            });

            it("should use coinValue of 100 when originalPromotion has coinValue 100", () => {
                // Arrange
                const baseData = TestDataFactory.createBaseData();
                const originalPromotion = TestDataFactory.createOriginalPromotion({ coinValue: 100 });

                // Act
                const result = consumer.extendPromo(baseData, originalPromotion);

                // Assert
                expect(result.coinValue).toBe(100);
            });
        });
    });

    describe("getDefaultBetLevel", () => {
        describe("when cascadingSlotsConfig has betLevels", () => {
            it("should return first betLevel when betLevels starts with 1", () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.betLevels = [1, 2, 3, 4, 5];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(1);
            });

            it("should return first betLevel when betLevels starts with 5", () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.betLevels = [5, 10, 15, 20];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(5);
            });

            it("should return first betLevel when betLevels has only one element", () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.betLevels = [42];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(42);
            });

            it("should return first betLevel when betLevels are in descending order", () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.betLevels = [10, 8, 6, 4, 2];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBe(10);
            });
        });

        describe("when cascadingSlotsConfig betLevels is empty", () => {
            it("should return undefined when betLevels array is empty", () => {
                // Arrange
                gameData.gameConfigs.cascadingSlotsConfig.betLevels = [];

                // Act
                const result = consumer.getDefaultBetLevel();

                // Assert
                expect(result).toBeUndefined();
            });
        });
    });

    describe("integration scenarios", () => {
        it("should use correct betLevel in extendPromo when gameData has custom betLevels", () => {
            // Arrange
            gameData.gameConfigs.cascadingSlotsConfig.betLevels = [3, 6, 9, 12];
            const baseData = TestDataFactory.createBaseData();
            const originalPromotion = TestDataFactory.createOriginalPromotion();
            const expectedResult = ExpectedResultBuilder.createExtendedPromo(baseData, originalPromotion, 3);

            // Act
            const result = consumer.extendPromo(baseData, originalPromotion);

            // Assert
            expect(result).toEqual(expectedResult);
        });

        it("should handle complete promotion extension with all custom values", () => {
            // Arrange
            gameData.gameConfigs.cascadingSlotsConfig.betLevels = [7, 14, 21];
            const baseData = TestDataFactory.createBaseData({
                promotionId: "custom-promo",
                freeSpinsAmount: 25,
                expirationDate: "2024-01-15T12:00:00.000Z",
                customProperty: "test-value",
            });
            const originalPromotion = TestDataFactory.createOriginalPromotion({
                coinValue: 75,
                type: "bonus-spins",
            });

            // Act
            const result = consumer.extendPromo(baseData, originalPromotion);

            // Assert
            expect(result.promotionId).toBe("custom-promo");
            expect(result.freeSpinsAmount).toBe(25);
            expect(result.expirationDate).toBe("2024-01-15T12:00:00.000Z");
            expect(result.customProperty).toBe("test-value");
            expect(result.betLevel).toBe(7);
            expect(result.coinValue).toBe(75);
        });
    });
});
