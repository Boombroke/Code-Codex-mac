import CoreGraphics
import ImageIO
import Foundation
import UniformTypeIdentifiers

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let size = base * scale
        let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.scaleBy(x: CGFloat(size)/64, y: CGFloat(size)/64)
        context.translateBy(x: 0, y: 64); context.scaleBy(x: 1, y: -1)
        context.setFillColor(CGColor(red: 16/255, green: 44/255, blue: 45/255, alpha: 1))
        context.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 64, height: 64), cornerWidth: 15, cornerHeight: 15, transform: nil)); context.fillPath()
        context.setStrokeColor(CGColor(red: 149/255, green: 226/255, blue: 191/255, alpha: 1)); context.setLineWidth(4); context.setLineCap(.round)
        context.move(to: CGPoint(x: 9,y: 43))
        context.addCurve(to: CGPoint(x: 26,y: 36), control1: CGPoint(x: 17,y: 16), control2: CGPoint(x: 22,y: 21))
        context.addCurve(to: CGPoint(x: 41,y: 23), control1: CGPoint(x: 31,y: 50), control2: CGPoint(x: 35,y: 50))
        context.addCurve(to: CGPoint(x: 55,y: 27), control1: CGPoint(x: 47,y: -4), control2: CGPoint(x: 52,y: 12)); context.strokePath()
        context.setFillColor(CGColor(red: 230/255, green: 1, blue: 241/255, alpha: 1)); context.fillEllipse(in: CGRect(x: 46,y: 10,width: 4,height: 4))
        let url = output.appendingPathComponent("icon_\(base)x\(base)\(scale == 2 ? "@2x" : "").png")
        let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, context.makeImage()!, nil); precondition(CGImageDestinationFinalize(destination))
    }
}
