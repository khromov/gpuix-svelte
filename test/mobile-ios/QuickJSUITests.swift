import XCTest
import Vision

/// Real UIKit touches/typing, with OCR of native GPUI pixels. No JS injection.
final class QuickJSUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "dev.gpuix.quickjsfixture")

    private func text(_ needle: String, timeout: TimeInterval = 6,
                      file: StaticString = #filePath, line: UInt = #line) throws -> CGRect {
        let end = Date().addingTimeInterval(timeout)
        var seen: [String] = []
        repeat {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            try VNImageRequestHandler(cgImage: app.screenshot().image.cgImage!).perform([request])
            seen = request.results?.compactMap { $0.topCandidates(1).first?.string } ?? []
            func normalized(_ value: String) -> String {
                value.replacingOccurrences(of: "“", with: "\"").replacingOccurrences(of: "”", with: "\"")
            }
            if let item = request.results?.first(where: {
                $0.topCandidates(1).first.map { normalized($0.string).localizedCaseInsensitiveContains(normalized(needle)) } == true
            }) { return item.boundingBox }
            Thread.sleep(forTimeInterval: 0.1)
        } while Date() < end
        XCTFail("Expected native GPU text \(needle), OCR saw \(seen)", file: file, line: line)
        throw NSError(domain: "QuickJSUITest", code: 1)
    }

    private func tapText(_ needle: String) throws {
        let bounds = try text(needle)
        app.coordinate(withNormalizedOffset: CGVector(dx: bounds.midX, dy: 1 - bounds.midY)).tap()
    }

    private func evidence(_ name: String) {
        let item = XCTAttachment(screenshot: app.screenshot())
        item.name = name
        item.lifetime = .keepAlways
        add(item)
    }

    func testRealNativeInputEffectsAndLifecycle() throws {
        app.terminate()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        _ = try text("Loaded")
        evidence("Native QuickJS initial")
        try tapText("First input")
        Thread.sleep(forTimeInterval: 1)
        evidence("After native touch")
        _ = try text("Focused native element: input", timeout: 3)
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 4), "Native input presents UIKit keyboard")
        app.typeText("quickjs42")
        try tapText("Search first")
        _ = try text("Loaded “quickjs42”")
        _ = try text("Focused native element: input")
        evidence("First controlled input and promise")
        try tapText("Second input")
        app.typeText("second7")
        try tapText("Search second")
        _ = try text("Loaded “second7”")
        evidence("Second independent native input")
        XCUIDevice.shared.press(.home)
        app.activate()
        _ = try text("Loaded “second7”")
        try tapText("Search first")
        _ = try text("Loaded “quickjs42”")
        XCUIDevice.shared.orientation = .landscapeLeft
        Thread.sleep(forTimeInterval: 1)
        evidence("Landscape native layout")
        XCUIDevice.shared.orientation = .portrait
        Thread.sleep(forTimeInterval: 1)
        _ = try text("Loaded “quickjs42”")
        try tapText("Search second")
        _ = try text("Loaded “second7”")
        evidence("Native input after rotation and resume")
    }
}
