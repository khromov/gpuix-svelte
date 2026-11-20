import XCTest
import UIKit

@MainActor
final class AccessibilityTests: XCTestCase {
    private func elements() -> [NSObject] {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
        func collect(_ view: UIView) -> [NSObject] {
            if let elements = view.accessibilityElements { return elements.compactMap { $0 as? NSObject } }
            return view.subviews.flatMap(collect)
        }
        return windows.flatMap(collect)
    }

    private func awaitElement(_ label: String, timeout: TimeInterval = 15,
                              file: StaticString = #filePath, line: UInt = #line) throws -> NSObject {
        let end = Date().addingTimeInterval(timeout)
        repeat {
            if let element = elements().first(where: { $0.accessibilityLabel == label || $0.accessibilityValue == label }) {
                return element
            }
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        } while Date() < end
        XCTFail("Missing native accessibility element: \(label); saw \(elements().map { $0.accessibilityLabel ?? $0.accessibilityValue ?? "<unnamed>" })", file: file, line: line)
        throw NSError(domain: "MobileAccessibility", code: 1)
    }

    func testNativeSemanticsAndAccessibilityActivation() throws {
        let heading = try awaitElement("Mobile counter")
        XCTAssertNotEqual(heading.accessibilityTraits.rawValue & UIAccessibilityTraits.header.rawValue, 0)
        _ = try awaitElement("Filesystem passed")
        _ = try awaitElement("0")
        let plus = try awaitElement("+")
        XCTAssertNotEqual(plus.accessibilityTraits.rawValue & UIAccessibilityTraits.button.rawValue, 0)
        XCTAssertGreaterThan(plus.accessibilityFrame.width, 0)
        XCTAssertGreaterThan(plus.accessibilityFrame.height, 0)
        XCTAssertLessThanOrEqual(plus.accessibilityFrame.maxX, UIScreen.main.bounds.maxX)
        XCTAssertTrue(plus.accessibilityActivate())
        _ = try awaitElement("1")
        XCTAssertTrue(try awaitElement("+") === plus, "Semantic updates retain element identity for VoiceOver focus")
        XCTAssertTrue(try awaitElement("−").accessibilityActivate())
        _ = try awaitElement("0")
        XCTAssertTrue(try awaitElement("+").accessibilityActivate())
        _ = try awaitElement("1")
        XCTAssertTrue(try awaitElement("Reset").accessibilityActivate())
        _ = try awaitElement("0")
        let input = try awaitElement("Accessible input")
        XCTAssertTrue(input.accessibilityActivate())
        _ = try awaitElement("Input focused")
        func firstResponder(_ view: UIView) -> UIView? {
            if view.isFirstResponder { return view }
            return view.subviews.compactMap(firstResponder).first
        }
        let inputWindows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
        let responder = try XCTUnwrap(inputWindows.compactMap(firstResponder).first as? UIKeyInput,
                                     "Accessibility activation should focus a UIKit text input")
        responder.insertText("Hello")
        _ = try awaitElement("Input: Hello")
        XCTAssertTrue(try awaitElement("Check clipboard").accessibilityActivate())
        _ = try awaitElement("Clipboard passed")
        XCTAssertEqual(UIPasteboard.general.string, "Svelte clipboard ✓")
        XCTAssertTrue(try awaitElement("Open file").accessibilityActivate())
        let deadline = Date().addingTimeInterval(15)
        var picker: UIDocumentPickerViewController?
        repeat {
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
            picker = windows.compactMap { $0.rootViewController?.presentedViewController as? UIDocumentPickerViewController }.first
            if picker == nil { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
        } while picker == nil && Date() < deadline
        let presented = try XCTUnwrap(picker, "The system document picker was presented")
        presented.delegate?.documentPickerWasCancelled?(presented)
        _ = try awaitElement("File selection cancelled")
        presented.dismiss(animated: false)
        let dismissDeadline = Date().addingTimeInterval(5)
        while presented.presentingViewController != nil && Date() < dismissDeadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
        XCTAssertNil(presented.presentingViewController)
        XCTAssertTrue(try awaitElement("Open file").accessibilityActivate())
        let selectionDeadline = Date().addingTimeInterval(15)
        var next: UIDocumentPickerViewController?
        repeat {
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
            next = windows.compactMap { $0.rootViewController?.presentedViewController as? UIDocumentPickerViewController }.first
            if next === presented { next = nil }
            if next == nil { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
        } while next == nil && Date() < selectionDeadline
        let active = try XCTUnwrap(next)
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("gpuix-picker.txt")
        try "hello-picker\n".write(to: path, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: path) }
        active.delegate?.documentPicker?(active, didPickDocumentsAt: [path])
        _ = try awaitElement("Imported: hello-picker")
        active.dismiss(animated: false)
        let closeDeadline = Date().addingTimeInterval(5)
        while active.presentingViewController != nil && Date() < closeDeadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
        XCTAssertTrue(try awaitElement("Open website").accessibilityActivate())
        let browserDeadline = Date().addingTimeInterval(10)
        while UIApplication.shared.applicationState == .active && Date() < browserDeadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
        XCTAssertNotEqual(UIApplication.shared.applicationState, .active, "Opening a URL should hand off to another app")
    }
}
