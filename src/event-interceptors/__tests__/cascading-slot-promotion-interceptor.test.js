import { stub } from "jest-micro-auto-stub";
import { EventInterceptors } from "sc-slot-game-base";
import CascadingSlotPromotionInterceptor from "../cascading-slot-promotion-interceptor";

// Test data factories for DRY setup
class PromotionInterceptorTestFactory {
    static createLogService(overrides = {}) {
        return {
            logInfo: jest.fn(),
            logWarning: jest.fn(),
            logError: jest.fn(),
            logDebug: jest.fn(),
            ...overrides,
        };
    }

    static createDefinition(overrides = {}) {
        return {
            id: 47,
            name: "cascading-game",
            ...overrides,
        };
    }

    static createGameData(overrides = {}) {
        return {
            ingame: {},
            gameConfigs: {
                cascadingSlotsConfig: {
                    betLevels: [1, 2, 3, 4, 5],
                    betMultiplier: 20,
                },
            },
            ...overrides,
        };
    }

    static createPlaceBetPublisher(overrides = {}) {
        return {
            publishToUser: jest.fn(),
            publish: jest.fn(),
            ...overrides,
        };
    }

    static createGamePromotionApiClient(overrides = {}) {
        return {
            instance: jest.fn(() => ({
                completePromotion: jest.fn(),
                getPromotionDetails: jest.fn(),
            })),
            ...overrides,
        };
    }

    static createPlayer(overrides = {}) {
        return {
            profile: {
                name: "testPlayer",
                ...overrides.profile,
            },
            session: {
                playerId: 123,
                operatorId: "op1",
                siteName: "testSite",
                ...overrides.session,
            },
            promotion: {
                promotionId: "promo123",
                remainingBonusItems: 5,
                freeSpinAvailable: 3,
                ...overrides.promotion,
            },
            ...overrides,
        };
    }

    static createContext(overrides = {}) {
        return {
            player: this.createPlayer(),
            request: {
                betLevel: 5,
                coinValue: 0.1,
                betMultiplier: 20,
            },
            ...overrides,
        };
    }

    static createDependencies(overrides = {}) {
        return {
            logService: this.createLogService(),
            definition: this.createDefinition(),
            gameData: this.createGameData(),
            placeBetPublisher: this.createPlaceBetPublisher(),
            gamePromotionApiClient: this.createGamePromotionApiClient(),
            ...overrides,
        };
    }
}

// Mock setup helper
class MockSetupHelper {
    static setupParentInterceptorMock() {
        const parentBeforeEvent = jest.fn();
        const parentAfterFailureEvent = jest.fn();
        
        jest.spyOn(EventInterceptors.SlotPromotionInterceptor.prototype, 'beforeEvent')
            .mockImplementation(parentBeforeEvent);
        jest.spyOn(EventInterceptors.SlotPromotionInterceptor.prototype, 'afterFailureEvent')
            .mockImplementation(parentAfterFailureEvent);

        return {
            parentBeforeEvent,
            parentAfterFailureEvent,
        };
    }
}

describe("CascadingSlotPromotionInterceptor", () => {
    let interceptor;
    let dependencies;
    let mockSetup;

    beforeEach(() => {
        // Arrange - Setup common test data
        jest.clearAllMocks();
        dependencies = PromotionInterceptorTestFactory.createDependencies();
        mockSetup = MockSetupHelper.setupParentInterceptorMock();
        
        interceptor = new CascadingSlotPromotionInterceptor(dependencies);
    });

    describe("constructor", () => {
        it("should inherit from EventInterceptors.SlotPromotionInterceptor", () => {
            // Act & Assert
            expect(interceptor instanceof EventInterceptors.SlotPromotionInterceptor).toBe(true);
        });

        it("should set gameData property", () => {
            // Act & Assert
            expect(interceptor.gameData).toEqual(dependencies.gameData);
        });

        it("should initialize with all required dependencies", () => {
            // Arrange
            const deps = PromotionInterceptorTestFactory.createDependencies();

            // Act
            const newInterceptor = new CascadingSlotPromotionInterceptor(deps);

            // Assert
            expect(newInterceptor.gameData).toBe(deps.gameData);
        });
    });

    describe("shouldCompletePromotion", () => {
        describe("when both bonus items and free spins are exhausted", () => {
            it("should return true when remainingBonusItems is 0 and freeSpinAvailable is 0", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    promotion: { remainingBonusItems: 0, freeSpinAvailable: 0 },
                });

                // Act
                const result = interceptor.shouldCompletePromotion(player);

                // Assert
                expect(result).toBe(true);
            });

            it("should return true when remainingBonusItems is 0 and freeSpinAvailable is negative", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    promotion: { remainingBonusItems: 0, freeSpinAvailable: -1 },
                });

                // Act
                const result = interceptor.shouldCompletePromotion(player);

                // Assert
                expect(result).toBe(true);
            });
        });

        describe("when bonus items remain available", () => {
            it("should return false when remainingBonusItems is greater than 0", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    promotion: { remainingBonusItems: 1, freeSpinAvailable: 0 },
                });

                // Act
                const result = interceptor.shouldCompletePromotion(player);

                // Assert
                expect(result).toBe(false);
            });

            it("should return false when remainingBonusItems is 5 and freeSpinAvailable is 0", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    promotion: { remainingBonusItems: 5, freeSpinAvailable: 0 },
                });

                // Act
                const result = interceptor.shouldCompletePromotion(player);

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("when free spins remain available", () => {
            it("should return false when freeSpinAvailable is greater than 0", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    promotion: { remainingBonusItems: 0, freeSpinAvailable: 1 },
                });

                // Act
                const result = interceptor.shouldCompletePromotion(player);

                // Assert
                expect(result).toBe(false);
            });

            it("should return false when freeSpinAvailable is 3 and remainingBonusItems is 0", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    promotion: { remainingBonusItems: 0, freeSpinAvailable: 3 },
                });

                // Act
                const result = interceptor.shouldCompletePromotion(player);

                // Assert
                expect(result).toBe(false);
            });
        });

        describe("when both bonus items and free spins are available", () => {
            it("should return false when both values are positive", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    promotion: { remainingBonusItems: 2, freeSpinAvailable: 3 },
                });

                // Act
                const result = interceptor.shouldCompletePromotion(player);

                // Assert
                expect(result).toBe(false);
            });
        });
    });

    describe("beforeEvent", () => {
        describe("when processing before event", () => {
            it("should call parent beforeEvent method", async () => {
                // Arrange
                const context = PromotionInterceptorTestFactory.createContext();

                // Act
                await interceptor.beforeEvent(context);

                // Assert
                expect(mockSetup.parentBeforeEvent).toHaveBeenCalledWith(context);
            });

            it("should call updatePromotionRemainingBonusItems with player", async () => {
                // Arrange
                const context = PromotionInterceptorTestFactory.createContext();
                const updateSpy = jest.spyOn(interceptor, 'updatePromotionRemainingBonusItems');

                // Act
                await interceptor.beforeEvent(context);

                // Assert
                expect(updateSpy).toHaveBeenCalledWith(context.player);
            });

            it("should call parent beforeEvent before updating promotion items", async () => {
                // Arrange
                const context = PromotionInterceptorTestFactory.createContext();
                const callOrder = [];
                
                mockSetup.parentBeforeEvent.mockImplementation(() => {
                    callOrder.push('parentBeforeEvent');
                });
                
                jest.spyOn(interceptor, 'updatePromotionRemainingBonusItems')
                    .mockImplementation(() => {
                        callOrder.push('updatePromotionRemainingBonusItems');
                    });

                // Act
                await interceptor.beforeEvent(context);

                // Assert
                expect(callOrder).toEqual(['parentBeforeEvent', 'updatePromotionRemainingBonusItems']);
            });
        });
    });

    describe("afterFailureEvent", () => {
        describe("when processing after failure event", () => {
            it("should call parent afterFailureEvent method", async () => {
                // Arrange
                const context = PromotionInterceptorTestFactory.createContext();

                // Act
                await interceptor.afterFailureEvent(context);

                // Assert
                expect(mockSetup.parentAfterFailureEvent).toHaveBeenCalledWith(context);
            });

            it("should call updatePromotionRemainingBonusItems with player", async () => {
                // Arrange
                const context = PromotionInterceptorTestFactory.createContext();
                const updateSpy = jest.spyOn(interceptor, 'updatePromotionRemainingBonusItems');

                // Act
                await interceptor.afterFailureEvent(context);

                // Assert
                expect(updateSpy).toHaveBeenCalledWith(context.player);
            });

            it("should call parent afterFailureEvent before updating promotion items", async () => {
                // Arrange
                const context = PromotionInterceptorTestFactory.createContext();
                const callOrder = [];
                
                mockSetup.parentAfterFailureEvent.mockImplementation(() => {
                    callOrder.push('parentAfterFailureEvent');
                });
                
                jest.spyOn(interceptor, 'updatePromotionRemainingBonusItems')
                    .mockImplementation(() => {
                        callOrder.push('updatePromotionRemainingBonusItems');
                    });

                // Act
                await interceptor.afterFailureEvent(context);

                // Assert
                expect(callOrder).toEqual(['parentAfterFailureEvent', 'updatePromotionRemainingBonusItems']);
            });
        });
    });

    describe("updatePromotionRemainingBonusItems", () => {
        describe("when player has promotion in gameData", () => {
            it("should update remainingBonusItems in gameData.ingame", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "promotionPlayer" },
                    promotion: { remainingBonusItems: 8 },
                });
                interceptor.gameData.ingame.promotionPlayer = {
                    promotion: { remainingBonusItems: 10 },
                };

                // Act
                interceptor.updatePromotionRemainingBonusItems(player);

                // Assert
                expect(interceptor.gameData.ingame.promotionPlayer.promotion.remainingBonusItems).toBe(8);
            });

            it("should update remainingBonusItems to 0 when player has no remaining items", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "noItemsPlayer" },
                    promotion: { remainingBonusItems: 0 },
                });
                interceptor.gameData.ingame.noItemsPlayer = {
                    promotion: { remainingBonusItems: 5 },
                };

                // Act
                interceptor.updatePromotionRemainingBonusItems(player);

                // Assert
                expect(interceptor.gameData.ingame.noItemsPlayer.promotion.remainingBonusItems).toBe(0);
            });

            it("should preserve other promotion properties when updating remainingBonusItems", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "preservePlayer" },
                    promotion: { remainingBonusItems: 3 },
                });
                interceptor.gameData.ingame.preservePlayer = {
                    promotion: {
                        remainingBonusItems: 7,
                        promotionId: "promo456",
                        type: "bonus",
                        otherProperty: "value",
                    },
                };

                // Act
                interceptor.updatePromotionRemainingBonusItems(player);

                // Assert
                expect(interceptor.gameData.ingame.preservePlayer.promotion).toEqual({
                    remainingBonusItems: 3,
                    promotionId: "promo456",
                    type: "bonus",
                    otherProperty: "value",
                });
            });
        });

        describe("when player has no promotion in gameData.ingame", () => {
            it("should not throw error when player name not in gameData.ingame", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "nonExistentPlayer" },
                    promotion: { remainingBonusItems: 5 },
                });
                interceptor.gameData.ingame = {};

                // Act & Assert
                expect(() => {
                    interceptor.updatePromotionRemainingBonusItems(player);
                }).not.toThrow();
            });

            it("should not modify gameData when player name not found", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "missingPlayer" },
                    promotion: { remainingBonusItems: 2 },
                });
                const originalGameData = { ingame: { otherPlayer: { promotion: { remainingBonusItems: 5 } } } };
                interceptor.gameData = { ...originalGameData };

                // Act
                interceptor.updatePromotionRemainingBonusItems(player);

                // Assert
                expect(interceptor.gameData).toEqual(originalGameData);
            });

            it("should not throw error when player exists but has no promotion property", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "noPromotionPlayer" },
                    promotion: { remainingBonusItems: 3 },
                });
                interceptor.gameData.ingame.noPromotionPlayer = { otherData: "value" };

                // Act & Assert
                expect(() => {
                    interceptor.updatePromotionRemainingBonusItems(player);
                }).not.toThrow();
            });
        });

        describe("when player name contains special characters", () => {
            it("should handle player names with spaces", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "player with spaces" },
                    promotion: { remainingBonusItems: 4 },
                });
                interceptor.gameData.ingame["player with spaces"] = {
                    promotion: { remainingBonusItems: 10 },
                };

                // Act
                interceptor.updatePromotionRemainingBonusItems(player);

                // Assert
                expect(interceptor.gameData.ingame["player with spaces"].promotion.remainingBonusItems).toBe(4);
            });

            it("should handle player names with special characters", () => {
                // Arrange
                const player = PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "player@123" },
                    promotion: { remainingBonusItems: 7 },
                });
                interceptor.gameData.ingame["player@123"] = {
                    promotion: { remainingBonusItems: 15 },
                };

                // Act
                interceptor.updatePromotionRemainingBonusItems(player);

                // Assert
                expect(interceptor.gameData.ingame["player@123"].promotion.remainingBonusItems).toBe(7);
            });
        });
    });

    describe("integration scenarios", () => {
        it("should handle complete workflow in beforeEvent", async () => {
            // Arrange
            const context = PromotionInterceptorTestFactory.createContext({
                player: PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "integrationPlayer" },
                    promotion: { remainingBonusItems: 2 },
                }),
            });
            interceptor.gameData.ingame.integrationPlayer = {
                promotion: { remainingBonusItems: 5 },
            };

            // Act
            await interceptor.beforeEvent(context);

            // Assert
            expect(interceptor.gameData.ingame.integrationPlayer.promotion.remainingBonusItems).toBe(2);
        });

        it("should handle complete workflow in afterFailureEvent", async () => {
            // Arrange
            const context = PromotionInterceptorTestFactory.createContext({
                player: PromotionInterceptorTestFactory.createPlayer({
                    profile: { name: "failurePlayer" },
                    promotion: { remainingBonusItems: 1 },
                }),
            });
            interceptor.gameData.ingame.failurePlayer = {
                promotion: { remainingBonusItems: 8 },
            };

            // Act
            await interceptor.afterFailureEvent(context);

            // Assert
            expect(interceptor.gameData.ingame.failurePlayer.promotion.remainingBonusItems).toBe(1);
        });

        it("should handle promotion completion logic with realistic data", () => {
            // Arrange
            const completedPlayer = PromotionInterceptorTestFactory.createPlayer({
                promotion: { remainingBonusItems: 0, freeSpinAvailable: 0 },
            });
            const activePlayer = PromotionInterceptorTestFactory.createPlayer({
                promotion: { remainingBonusItems: 3, freeSpinAvailable: 2 },
            });

            // Act
            const completedResult = interceptor.shouldCompletePromotion(completedPlayer);
            const activeResult = interceptor.shouldCompletePromotion(activePlayer);

            // Assert
            expect(completedResult).toBe(true);
            expect(activeResult).toBe(false);
        });
    });
});
