import XCTest
import Vision

final class ProductUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "dev.gpuix.svelte.mobilecounter")

    private func text(_ needle: String) throws -> CGRect {
        let end = Date().addingTimeInterval(20)
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
            Thread.sleep(forTimeInterval: 0.3)
        } while Date() < end
        XCTFail("Expected \(needle); saw \(seen)")
        throw NSError(domain: "ProductUITests", code: 1)
    }

    func testFileImport() throws {
        app.launch()
        _ = try text("Filesystem passed")
        let bounds = try text("Open file")
        app.coordinate(withNormalizedOffset: CGVector(dx: bounds.midX, dy: 1 - bounds.midY)).tap()
        let file = app.cells["gpuix-mobile-test, txt"]
        if !file.waitForExistence(timeout: 5) {
            let browse = app.buttons.matching(identifier: "Browse").firstMatch
            if browse.exists { browse.tap() }
            let local = app.staticTexts["On My iPhone"]
            if local.waitForExistence(timeout: 5) { local.tap() }
        }
        XCTAssertTrue(file.waitForExistence(timeout: 10), app.debugDescription)
        file.tap()
        _ = try text("Imported: chosen document works")
    }
}
