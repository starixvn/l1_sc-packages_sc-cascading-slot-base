import { InjectionMode } from "awilix";
import * as Slot from "sc-slot-game-base";
import ServiceContainerRegistry from "../cascading-slot-container-registry";

jest.mock(
    "awilix",
    () => {
        return {
            asClass: (t) => {
                return {
                    proxy: () => t,
                    singleton: () => {
                        return { proxy: jest.fn(() => t) };
                    },
                };
            },
            asValue: jest.fn((t) => t),
            asFunction: (fn) => {
                return {
                    singleton: () => fn,
                };
            },
            InjectionMode: jest.fn(() => {}),
            createContainer: jest.fn(() => {}),
        };
    },
    { virtual: true }
);

describe("service-container-registry", () => {
    // Arrange
    const defaultInjectionMode = InjectionMode.CLASSIC;

    it("inherit Slot.SlotContainerRegistry", () => {
        // arrange
        const serviceContainerRegistry = new ServiceContainerRegistry(defaultInjectionMode);

        //assert
        expect(serviceContainerRegistry instanceof Slot.SlotContainerRegistry);
    });

    describe("registerApis", () => {
        it("should register correct apis", () => {
            // Arrange
            const serviceContainerRegistry = new ServiceContainerRegistry(defaultInjectionMode);
            serviceContainerRegistry.container = { register: jest.fn() };

            // Act
            serviceContainerRegistry.registerApis();

            // Assert
            expect(serviceContainerRegistry.container.register).toBeCalledWith({
                historyQuery: expect.any(Object),
            });
        });
    });
});

class CascadingSlotRegistryTestFactory {
    static createMockContainer() {
        return {
            register: jest.fn(),
            resolve: jest.fn(),
        };
    }

    static createMockAppConfigs() {
        return {
            port: 3000,
            environment: "test",
            database: {
                connectionString: "mongodb://test",
            },
        };
    }

    static createMockDefinition() {
        return {
            gameId: "cascading-slots",
            gameName: "Cascading Slots",
            boardSettings: {
                rows: 5,
                cols: 5,
                symbols: ["A", "B", "C", "D", "E"],
            },
        };
    }

    static createMockGameData() {
        return {
            gameConfigs: {
                minbet: 1,
                maxbet: 1000,
            },
            ingame: {},
            realPlayers: {},
        };
    }

    static createRegistryWithMockContainer(injectionMode = InjectionMode.CLASSIC) {
        const registry = new ServiceContainerRegistry(injectionMode);
        registry.container = CascadingSlotRegistryTestFactory.createMockContainer();
        return registry;
    }

    static createExpectedBoardUtilitiesRegistration() {
        return {
            boardSettings: expect.any(Object),
            tumbleCalculator: expect.anything(),
            roundCalculator: expect.any(Function),
            boardGenerator: expect.anything(),
        };
    }

    static createExpectedResultChainsRegistration() {
        return {
            resultChainManager: expect.any(Function),
            userChainConsumer: expect.any(Function),
            chainInterceptor: expect.any(Function),
        };
    }

    static createExpectedModelsRegistration() {
        return {
            userSessionsRepository: expect.any(Function),
        };
    }

    static createExpectedRoutersRegistration() {
        return {
            httpRouter: expect.anything(),
        };
    }

    static createExpectedConsumersRegistration() {
        return {
            placeBetConsumer: expect.anything(),
            settleGameRoundConsumer: expect.any(Function),
            totalMultiplierConsumer: expect.anything(),
            freeSpinsConsumer: expect.anything(),
            inGameConsumer: expect.any(Function),
            userSignInConsumer: expect.any(Function),
            promotionFreeSpinsConsumer: expect.any(Function),
        };
    }

    static createExpectedCronsRegistration() {
        return {
            bot: expect.any(Function),
            gameCron: expect.any(Function),
            processBetQueue: expect.any(Function),
        };
    }

    static createExpectedInterceptorsRegistration() {
        return {
            promotionBetInterceptor: expect.any(Function),
        };
    }
}

describe("CascadingSlotContainerRegistry - Enhanced Coverage", () => {
    let mockSuperRegister;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSuperRegister = jest.spyOn(Slot.SlotContainerRegistry.prototype, 'register').mockImplementation(() => {});
        jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerModels').mockImplementation(() => {});
        jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerRouters').mockImplementation(() => {});
        jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerConsumers').mockImplementation(() => {});
        jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerApis').mockImplementation(() => {});
        jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerCrons').mockImplementation(() => {});
        jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerInterceptors').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("register", () => {
        it("should call registerBoardUtilities during registration", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const appConfigs = CascadingSlotRegistryTestFactory.createMockAppConfigs();
            const definition = CascadingSlotRegistryTestFactory.createMockDefinition();
            const gameData = CascadingSlotRegistryTestFactory.createMockGameData();
            const registerBoardUtilitiesSpy = jest.spyOn(registry, 'registerBoardUtilities');

            // Act
            registry.register(appConfigs, definition, gameData);

            // Assert
            expect(registerBoardUtilitiesSpy).toHaveBeenCalled();
        });

        it("should call registerResultChains during registration", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const appConfigs = CascadingSlotRegistryTestFactory.createMockAppConfigs();
            const definition = CascadingSlotRegistryTestFactory.createMockDefinition();
            const gameData = CascadingSlotRegistryTestFactory.createMockGameData();
            const registerResultChainsSpy = jest.spyOn(registry, 'registerResultChains');

            // Act
            registry.register(appConfigs, definition, gameData);

            // Assert
            expect(registerResultChainsSpy).toHaveBeenCalled();
        });

        it("should call super.register with correct parameters", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const appConfigs = CascadingSlotRegistryTestFactory.createMockAppConfigs();
            const definition = CascadingSlotRegistryTestFactory.createMockDefinition();
            const gameData = CascadingSlotRegistryTestFactory.createMockGameData();

            // Act
            registry.register(appConfigs, definition, gameData);

            // Assert
            expect(mockSuperRegister).toHaveBeenCalledWith(appConfigs, definition, gameData);
        });

        it("should return container after registration", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const appConfigs = CascadingSlotRegistryTestFactory.createMockAppConfigs();
            const definition = CascadingSlotRegistryTestFactory.createMockDefinition();
            const gameData = CascadingSlotRegistryTestFactory.createMockGameData();

            // Act
            const result = registry.register(appConfigs, definition, gameData);

            // Assert
            expect(result).toBe(registry.container);
        });
    });

    describe("registerModels", () => {
        it("should call super.registerModels", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const superRegisterModelsSpy = jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerModels');

            // Act
            registry.registerModels();

            // Assert
            expect(superRegisterModelsSpy).toHaveBeenCalled();
        });

        it("should register userSessionsRepository", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const expectedRegistration = CascadingSlotRegistryTestFactory.createExpectedModelsRegistration();

            // Act
            registry.registerModels();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(expectedRegistration);
        });
    });

    describe("registerBoardUtilities", () => {
        it("should register boardSettings from defaultDefinition", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerBoardUtilities();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith({
                boardSettings: expect.any(Object),
            });
        });

        it("should register tumbleCalculator as class", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerBoardUtilities();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    tumbleCalculator: expect.any(Object),
                })
            );
        });

        it("should register roundCalculator with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerBoardUtilities();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    roundCalculator: expect.any(Function),
                })
            );
        });

        it("should register boardGenerator as singleton", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerBoardUtilities();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    boardGenerator: expect.any(Object),
                })
            );
        });
    });

    describe("registerResultChains", () => {
        it("should register resultChainManager as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerResultChains();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    resultChainManager: expect.any(Function),
                })
            );
        });

        it("should register userChainConsumer as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerResultChains();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    userChainConsumer: expect.any(Function),
                })
            );
        });

        it("should register chainInterceptor as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerResultChains();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    chainInterceptor: expect.any(Function),
                })
            );
        });

        it("should register all result chain dependencies in single call", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const expectedRegistration = CascadingSlotRegistryTestFactory.createExpectedResultChainsRegistration();

            // Act
            registry.registerResultChains();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(expectedRegistration);
        });
    });

    describe("registerRouters", () => {
        it("should call super.registerRouters", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const superRegisterRoutersSpy = jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerRouters');

            // Act
            registry.registerRouters();

            // Assert
            expect(superRegisterRoutersSpy).toHaveBeenCalled();
        });

        it("should register httpRouter", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const expectedRegistration = CascadingSlotRegistryTestFactory.createExpectedRoutersRegistration();

            // Act
            registry.registerRouters();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(expectedRegistration);
        });
    });

    describe("registerConsumers", () => {
        it("should call super.registerConsumers", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const superRegisterConsumersSpy = jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerConsumers');

            // Act
            registry.registerConsumers();

            // Assert
            expect(superRegisterConsumersSpy).toHaveBeenCalled();
        });

        it("should register placeBetConsumer as singleton", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    placeBetConsumer: expect.any(Object),
                })
            );
        });

        it("should register settleGameRoundConsumer as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    settleGameRoundConsumer: expect.any(Function),
                })
            );
        });

        it("should register totalMultiplierConsumer as singleton", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    totalMultiplierConsumer: expect.any(Object),
                })
            );
        });

        it("should register freeSpinsConsumer as singleton", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    freeSpinsConsumer: expect.any(Object),
                })
            );
        });

        it("should register inGameConsumer as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    inGameConsumer: expect.any(Function),
                })
            );
        });

        it("should register userSignInConsumer as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    userSignInConsumer: expect.any(Function),
                })
            );
        });

        it("should register promotionFreeSpinsConsumer as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    promotionFreeSpinsConsumer: expect.any(Function),
                })
            );
        });

        it("should register all consumers in single call", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const expectedRegistration = CascadingSlotRegistryTestFactory.createExpectedConsumersRegistration();

            // Act
            registry.registerConsumers();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(expectedRegistration);
        });
    });

    describe("registerCrons", () => {
        it("should call super.registerCrons", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const superRegisterCronsSpy = jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerCrons');

            // Act
            registry.registerCrons();

            // Assert
            expect(superRegisterCronsSpy).toHaveBeenCalled();
        });

        it("should register bot as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerCrons();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    bot: expect.any(Function),
                })
            );
        });

        it("should register gameCron as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerCrons();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    gameCron: expect.any(Function),
                })
            );
        });

        it("should register processBetQueue as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerCrons();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(
                expect.objectContaining({
                    processBetQueue: expect.any(Function),
                })
            );
        });

        it("should register all crons in single call", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const expectedRegistration = CascadingSlotRegistryTestFactory.createExpectedCronsRegistration();

            // Act
            registry.registerCrons();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(expectedRegistration);
        });
    });

    describe("registerInterceptors", () => {
        it("should call super.registerInterceptors", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const superRegisterInterceptorsSpy = jest.spyOn(Slot.SlotContainerRegistry.prototype, 'registerInterceptors');

            // Act
            registry.registerInterceptors();

            // Assert
            expect(superRegisterInterceptorsSpy).toHaveBeenCalled();
        });

        it("should register promotionBetInterceptor as singleton with proxy", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
            const expectedRegistration = CascadingSlotRegistryTestFactory.createExpectedInterceptorsRegistration();

            // Act
            registry.registerInterceptors();

            // Assert
            expect(registry.container.register).toHaveBeenCalledWith(expectedRegistration);
        });
    });

    describe("registerInterceptorArrays", () => {
        describe("betEventInterceptors", () => {
            it("should register betEventInterceptors as function", () => {
                // Arrange
                const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

                // Act
                registry.registerInterceptorArrays();

                // Assert
                expect(registry.container.register).toHaveBeenCalledWith(
                    expect.objectContaining({
                        betEventInterceptors: expect.any(Function),
                    })
                );
            });

            it("should include promotionBetInterceptor when resolved", () => {
                // Arrange
                const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
                const mockPromotionInterceptor = { name: "promotionBetInterceptor" };
                registry.container.resolve.mockImplementation((name) => {
                    if (name === "promotionBetInterceptor") return mockPromotionInterceptor;
                    if (name === "chainInterceptor") return null;
                    return null;
                });
                registry.registerInterceptorArrays();
                const registeredFunction = registry.container.register.mock.calls[0][0].betEventInterceptors;

                // Act
                const result = registeredFunction();

                // Assert
                expect(result).toContain(mockPromotionInterceptor);
            });

            it("should include chainInterceptor when resolved", () => {
                // Arrange
                const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
                const mockChainInterceptor = { name: "chainInterceptor" };
                registry.container.resolve.mockImplementation((name) => {
                    if (name === "promotionBetInterceptor") return null;
                    if (name === "chainInterceptor") return mockChainInterceptor;
                    return null;
                });
                registry.registerInterceptorArrays();
                const registeredFunction = registry.container.register.mock.calls[0][0].betEventInterceptors;

                // Act
                const result = registeredFunction();

                // Assert
                expect(result).toContain(mockChainInterceptor);
            });

            it("should return empty array when no interceptors resolved", () => {
                // Arrange
                const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
                registry.container.resolve.mockReturnValue(null);
                registry.registerInterceptorArrays();
                const registeredFunction = registry.container.register.mock.calls[0][0].betEventInterceptors;

                // Act
                const result = registeredFunction();

                // Assert
                expect(result).toEqual([]);
            });

            it("should return both interceptors when both resolved", () => {
                // Arrange
                const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();
                const mockPromotionInterceptor = { name: "promotionBetInterceptor" };
                const mockChainInterceptor = { name: "chainInterceptor" };
                registry.container.resolve.mockImplementation((name) => {
                    if (name === "promotionBetInterceptor") return mockPromotionInterceptor;
                    if (name === "chainInterceptor") return mockChainInterceptor;
                    return null;
                });
                registry.registerInterceptorArrays();
                const registeredFunction = registry.container.register.mock.calls[0][0].betEventInterceptors;

                // Act
                const result = registeredFunction();

                // Assert
                expect(result).toHaveLength(2);
                expect(result).toContain(mockPromotionInterceptor);
                expect(result).toContain(mockChainInterceptor);
            });
        });
    });

    describe("Integration Scenarios", () => {
        it("should register all dependencies during full registration", () => {
            // Arrange
            const registry = new ServiceContainerRegistry(InjectionMode.CLASSIC);
            registry.container = CascadingSlotRegistryTestFactory.createMockContainer();
            const appConfigs = CascadingSlotRegistryTestFactory.createMockAppConfigs();
            const definition = CascadingSlotRegistryTestFactory.createMockDefinition();
            const gameData = CascadingSlotRegistryTestFactory.createMockGameData();
            
            const registerBoardUtilitiesSpy = jest.spyOn(registry, 'registerBoardUtilities');
            const registerResultChainsSpy = jest.spyOn(registry, 'registerResultChains');

            // Act
            registry.register(appConfigs, definition, gameData);

            // Assert
            expect(registerBoardUtilitiesSpy).toHaveBeenCalled();
            expect(registerResultChainsSpy).toHaveBeenCalled();
            expect(mockSuperRegister).toHaveBeenCalled();
        });

        it("should handle container registration calls correctly", () => {
            // Arrange
            const registry = CascadingSlotRegistryTestFactory.createRegistryWithMockContainer();

            // Act
            registry.registerBoardUtilities();
            registry.registerResultChains();

            // Assert
            expect(registry.container.register).toHaveBeenCalledTimes(3);
            expect(registry.container.register).toHaveBeenNthCalledWith(1, expect.any(Object));
            expect(registry.container.register).toHaveBeenNthCalledWith(2, expect.any(Object));
            expect(registry.container.register).toHaveBeenNthCalledWith(3, expect.any(Object));
        });
    });
});