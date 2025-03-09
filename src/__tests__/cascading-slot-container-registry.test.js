import ServiceContainerRegistry from "../cascading-slot-container-registry";
import * as Slot from "sc-slot-game-base";
import { InjectionMode } from "awilix";

jest.mock("node:crypto", () => require("crypto"), { virtual: true });

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

    describe("registerConsumers", () => {
        it("should register correct consumers", () => {
            // Arrange
            const serviceContainerRegistry = new ServiceContainerRegistry(defaultInjectionMode);
            serviceContainerRegistry.container = { register: jest.fn() };

            // Act
            serviceContainerRegistry.registerConsumers();

            // Assert
            expect(serviceContainerRegistry.container.register).toBeCalledWith({
                placeBetConsumer: expect.any(Object),
                settleGameRoundConsumer: expect.any(Function),
                totalMultiplierConsumer: expect.any(Object),
                freeSpinsConsumer: expect.any(Object),
                userSignInConsumer: expect.any(Object),
                inGameConsumer: expect.any(Function),
            });
        });
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
