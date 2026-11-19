import Foundation
import ImageIO
import Vision

// OCR native GPU pixels; no accessibility-tree or JavaScript test hook.
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let request = VNRecognizeTextRequest()
// CPU OCR also works in an OS-locked host session (no Metal presentation).
request.usesCPUOnly = true
request.recognitionLevel = .fast
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: image).perform([request])
let rows: [[String: Any]] = (request.results ?? []).compactMap { observation in
    guard let text = observation.topCandidates(1).first?.string else { return nil }
    let box = observation.boundingBox
    return ["text": text, "x": box.midX * Double(image.width),
            "y": (1 - box.midY) * Double(image.height)]
}
let result: [String: Any] = ["width": image.width, "height": image.height, "rows": rows]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
