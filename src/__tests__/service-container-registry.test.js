import ServiceContainerRegistry from "../service-container-registry";
import * as Slot from "sc-slot-game-base";
import { InjectionMode } from "awilix";

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
