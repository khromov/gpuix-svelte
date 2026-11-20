import XCTest

final class MobileParityTests: XCTestCase {
    func testTouchAndAccessibility() {
        let app = XCUIApplication(bundleIdentifier: "dev.gpuix.mobileparity")
        app.launch()
        XCTAssertTrue(app.staticTexts["Filesystem passed"].waitForExistence(timeout: 30), app.debugDescription)
        let slider = app.otherElements["Volume"]
        XCTAssertTrue(slider.waitForExistence(timeout: 10), app.debugDescription)
        let start = slider.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5))
        let end = slider.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
        start.press(forDuration: 0.1, thenDragTo: end)
        XCTAssertNotEqual(slider.value as? String, "25")
        let secondary = app.buttons["Hold secondary"]
        XCTAssertTrue(secondary.waitForExistence(timeout: 5))
        secondary.press(forDuration: 1)
        XCTAssertTrue(app.staticTexts["Secondary: 1"].waitForExistence(timeout: 5))
    }
}
