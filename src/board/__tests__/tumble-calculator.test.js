import TumbleCalculator from "../tumble-calculator";
import { gameConfigs } from "../../test-data";

function initTunmbleCalculator() {
    return new TumbleCalculator();
}

describe("calculate", () => {
    describe("when board has winning icons", () => {
        const tumble = {
            originalBoard: "8,8,8,3,8,9,8,8,8,9,5,9,8,10,10,9,5,8,10,11,10,6,11,8,10,11,11,6,11,7",
        };

        it("should calculate win correctly", () => {
            //Arrange

            const calculator = initTunmbleCalculator();

            //Act
            const result = calculator.calculate(tumble, 10, gameConfigs.cascadingSlotsConfig);

            //Assert
            expect(result.win).toEqual(20);
        });

        it("should list winning icons correctly", () => {
            //Arrange

            const calculator = initTunmbleCalculator();

            //Act
            const result = calculator.calculate(tumble, 10, gameConfigs.cascadingSlotsConfig);

            //Assert
            expect(result.icons).toEqual({ 8: { count: 10, odds: 2, win: 10 * 2 } });
        });
    });

    describe("when board has no winning icon", () => {
        const tumble = {
            originalBoard: "8,1,1,3,2,9,3,5,6,9,5,9,8,10,10,9,5,8,10,11,10,6,11,8,10,11,11,6,11,7",
        };

        it("should calculate win = 0", () => {
            //Arrange

            const calculator = initTunmbleCalculator();

            //Act
            const result = calculator.calculate(tumble, 10, gameConfigs.cascadingSlotsConfig);

            //Assert
            expect(result.win).toEqual(0);
        });

        it("should list winning icons = empty", () => {
            //Arrange

            const calculator = initTunmbleCalculator();

            //Act
            const result = calculator.calculate(tumble, 10, gameConfigs.cascadingSlotsConfig);

            //Assert
            expect(result.icons).toEqual({});
        });
    });
});

describe("calculate win amount", () => {
    describe("when theres no winning icon", () => {
        it("win should be zero", () => {
            //Arrange
            const calculator = initTunmbleCalculator();
            const tumble = { icons: {} };

            //Act
            calculator.calculateWinAmount(tumble, 0.5);

            //Assert
            expect(tumble.win).toEqual(0);
        });
    });

    describe("when there're winning icons", () => {
        it("each icon should have win correctly", () => {
            //Arrange
            const calculator = initTunmbleCalculator();
            const tumble = {
                icons: {
                    8: {
                        count: 8,
                        odds: 1.5,
                    },
                    9: {
                        count: 9,
                        odds: 2,
                    },
                },
            };

            //Act
            calculator.calculateWinAmount(tumble, 0.5);

            //Assert
            Object.values(tumble.icons).forEach((value) => {
                expect(value.win).toEqual(0.5 * value.odds);
            });
        });

        it("should calculate tumble win correctly", () => {
            //Arrange
            const calculator = initTunmbleCalculator();
            const tumble = {
                icons: {
                    8: {
                        count: 8,
                        odds: 1.5,
                    },
                    9: {
                        count: 9,
                        odds: 2,
                    },
                },
            };

            //Act
            calculator.calculateWinAmount(tumble, 0.5);

            //Assert
            expect(tumble.win).toEqual(Object.values(tumble.icons).reduce((tumbleWin, value) => tumbleWin + 0.5 * value.odds, 0));
        });
    });
});
