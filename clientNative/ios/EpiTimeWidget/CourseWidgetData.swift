import Foundation
import SwiftUI

let epitimeAppGroup = "group.fr.alexistb2904.epitime"

struct CoursePayload: Decodable {
  let generatedAt: Double?
  let courses: [CourseItem]
}

struct CourseItem: Decodable, Identifiable {
  let idValue: String
  let title: String
  let type: String
  let room: String
  let teacher: String
  let startMillis: Double
  let endMillis: Double
  let color: String

  var id: String { idValue }

  enum CodingKeys: String, CodingKey {
    case idValue = "id"
    case title
    case type
    case room
    case teacher
    case startMillis
    case endMillis
    case color
  }

  var startDate: Date {
    Date(timeIntervalSince1970: startMillis / 1000)
  }

  var endDate: Date {
    Date(timeIntervalSince1970: endMillis / 1000)
  }

  var accent: Color {
    Color(hex: color) ?? Color(red: 0.05, green: 0.65, blue: 0.91)
  }
}

extension CourseItem {
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedId = try? container.decode(String.self, forKey: .idValue)
    let numericId = try? container.decode(Int.self, forKey: .idValue)
    idValue = decodedId ?? numericId.map(String.init) ?? UUID().uuidString
    title = (try? container.decode(String.self, forKey: .title)) ?? "Cours"
    type = (try? container.decode(String.self, forKey: .type)) ?? "Cours"
    room = (try? container.decode(String.self, forKey: .room)) ?? "Lieu a confirmer"
    teacher = (try? container.decode(String.self, forKey: .teacher)) ?? ""
    startMillis = (try? container.decode(Double.self, forKey: .startMillis)) ?? 0
    endMillis = (try? container.decode(Double.self, forKey: .endMillis)) ?? 0
    color = (try? container.decode(String.self, forKey: .color)) ?? "#0EA5E9"
  }
}

enum CourseWidgetData {
  static func upcoming(limit: Int = 8, now: Date = Date()) -> [CourseItem] {
    guard
      let defaults = UserDefaults(suiteName: epitimeAppGroup),
      let raw = defaults.string(forKey: "courses_json"),
      let data = raw.data(using: .utf8),
      let payload = try? JSONDecoder().decode(CoursePayload.self, from: data)
    else {
      return []
    }

    return payload.courses
      .filter { $0.endDate > now }
      .sorted { $0.startDate < $1.startDate }
      .prefix(limit)
      .map { $0 }
  }

  static func updatedAt() -> Date? {
    guard let defaults = UserDefaults(suiteName: epitimeAppGroup) else { return nil }
    let millis = defaults.double(forKey: "updated_at")
    return millis > 0 ? Date(timeIntervalSince1970: millis / 1000) : nil
  }
}

extension Color {
  init?(hex: String) {
    let raw = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    guard let value = UInt64(raw, radix: 16) else { return nil }
    let red: Double
    let green: Double
    let blue: Double

    switch raw.count {
    case 6:
      red = Double((value & 0xFF0000) >> 16) / 255
      green = Double((value & 0x00FF00) >> 8) / 255
      blue = Double(value & 0x0000FF) / 255
    default:
      return nil
    }

    self.init(red: red, green: green, blue: blue)
  }
}
