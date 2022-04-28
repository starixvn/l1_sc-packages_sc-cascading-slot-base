import TumbleCalculator from "../tumble-calculator";
import { gameConfigs } from "../../test-data";

const gameData = {
    gameConfigs,
};

function initTunmbleCalculator() {
    return new TumbleCalculator(gameData);
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
            const result = calculator.calculate(tumble, 10);

            //Assert
            expect(result.win).toEqual(15);
        });

        it("should list winning icons correctly", () => {
            //Arrange

            const calculator = initTunmbleCalculator();

            //Act
            const result = calculator.calculate(tumble, 10);

            //Assert
            expect(result.icons).toEqual({ 8: { count: 10, odds: 1.5 } });
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
            const result = calculator.calculate(tumble, 10);

            //Assert
            expect(result.win).toEqual(0);
        });

        it("should list winning icons = empty", () => {
            //Arrange

            const calculator = initTunmbleCalculator();

            //Act
            const result = calculator.calculate(tumble, 10);

            //Assert
            expect(result.icons).toEqual({});
        });
    });
});
