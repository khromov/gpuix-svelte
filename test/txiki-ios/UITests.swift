import XCTest
import Vision

final class TxikiUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "dev.gpuix.txikisvelte")

    private func text(_ needle: String, timeout: TimeInterval = 15) throws -> CGRect {
        let end = Date().addingTimeInterval(timeout)
        var seen: [String] = []
        repeat {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            try VNImageRequestHandler(cgImage: app.screenshot().image.cgImage!).perform([request])
            seen = request.results?.compactMap { $0.topCandidates(1).first?.string } ?? []
            if let item = request.results?.first(where: {
                $0.topCandidates(1).first?.string.localizedCaseInsensitiveContains(needle) == true
            }) { return item.boundingBox }
            Thread.sleep(forTimeInterval: 0.2)
        } while Date() < end
        XCTFail("Expected \(needle), OCR saw \(seen)")
        throw NSError(domain: "TxikiUITests", code: 1)
    }

    private func timer() throws -> Int {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        try VNImageRequestHandler(cgImage: app.screenshot().image.cgImage!).perform([request])
        for item in request.results ?? [] {
            let value = item.topCandidates(1).first?.string ?? ""
            if let range = value.range(of: #"Timer:\s*\d+"#, options: .regularExpression),
               let number = Int(value[range].drop(while: { !$0.isNumber })) { return number }
        }
        XCTFail("Timer not visible")
        throw NSError(domain: "TxikiUITests", code: 2)
    }

    private func tap(_ label: String) throws {
        let bounds = try text(label)
        app.coordinate(withNormalizedOffset: CGVector(dx: bounds.midX, dy: 1 - bounds.midY)).tap()
    }

    func testCounterInputNetworkAndLifecycle() throws {
        app.terminate()
        app.launch()
        _ = try text("HTTPS OK", timeout: 30)
        _ = try text("Native ready")
        try tap("Choose file")
        let cancel = app.buttons["Cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 10))
        cancel.tap()
        _ = try text("Picker cancelled")
        try tap("Choose file")
        let file = app.cells["gpuix-txiki-upload-test, png"]
        if !file.waitForExistence(timeout: 5) {
            let browse = app.buttons.matching(identifier: "Browse").firstMatch
            if browse.exists { browse.tap() }
            let local = app.staticTexts["On My iPhone"]
            if local.waitForExistence(timeout: 5) { local.tap() }
        }
        XCTAssertTrue(file.waitForExistence(timeout: 10), app.debugDescription)
        file.tap()
        _ = try text("Image uploaded", timeout: 30)
        _ = try text("Count: 0")
        let before = try timer()
        Thread.sleep(forTimeInterval: 2)
        XCTAssertGreaterThan(try timer(), before)
        try tap("Increment")
        _ = try text("Count: 1")
        try tap("Reset")
        _ = try text("Count: 0")
        try tap("Increment")
        _ = try text("Count: 1")
        try tap("Type here")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 8))
        for key in ["t", "x", "i", "k", "i"] { app.keys[key].tap() }
        app.keys["numbers"].tap()
        app.keys["4"].tap()
        app.keys["2"].tap()
        try tap("Save input")
        _ = try text("Saved: txiki42")
        XCUIDevice.shared.press(.home)
        app.activate()
        _ = try text("Count: 1")
        _ = try text("Saved: txiki42")
        XCUIDevice.shared.orientation = .landscapeLeft
        Thread.sleep(forTimeInterval: 2)
        XCUIDevice.shared.orientation = .portrait
        Thread.sleep(forTimeInterval: 2)
        _ = try text("Saved: txiki42")
        app.terminate()
        app.launch()
        _ = try text("Count: 0")
        _ = try text("HTTPS OK", timeout: 30)
    }
}
