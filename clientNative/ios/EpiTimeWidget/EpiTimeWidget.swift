import WidgetKit
import SwiftUI

struct CourseTimelineEntry: TimelineEntry {
  let date: Date
  let courses: [CourseItem]
}

struct CourseTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> CourseTimelineEntry {
    CourseTimelineEntry(date: Date(), courses: [
      CourseItem.preview
    ])
  }

  func getSnapshot(in context: Context, completion: @escaping (CourseTimelineEntry) -> Void) {
    completion(CourseTimelineEntry(date: Date(), courses: CourseWidgetData.upcoming(limit: 4)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CourseTimelineEntry>) -> Void) {
    let courses = CourseWidgetData.upcoming(limit: 8)
    let nextRefresh = courses.first?.endDate.addingTimeInterval(60) ?? Date().addingTimeInterval(30 * 60)
    completion(Timeline(entries: [CourseTimelineEntry(date: Date(), courses: courses)], policy: .after(nextRefresh)))
  }
}

struct NextCourseWidgetView: View {
  let entry: CourseTimelineEntry

  var body: some View {
    if let course = entry.courses.first {
      HStack(spacing: 12) {
        RoundedRectangle(cornerRadius: 3)
          .fill(course.accent)
          .frame(width: 6)

        VStack(alignment: .leading, spacing: 6) {
          Text(label(for: course))
            .font(.caption.weight(.bold))
            .foregroundStyle(course.accent)
            .lineLimit(1)
          Text(course.title)
            .font(.headline.weight(.bold))
            .foregroundStyle(.primary)
            .lineLimit(2)
          Text("\(course.startDate.formatted(date: .abbreviated, time: .shortened)) - \(course.endDate.formatted(date: .omitted, time: .shortened))")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .lineLimit(1)
          Text(course.room)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      .containerBackground(.fill.tertiary, for: .widget)
    } else {
      VStack(alignment: .leading, spacing: 8) {
        Text("Planning")
          .font(.caption.weight(.bold))
          .foregroundStyle(.secondary)
        Text("Aucun cours a venir")
          .font(.headline.weight(.bold))
        Text("Ouvre EpiTime pour synchroniser.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .containerBackground(.fill.tertiary, for: .widget)
    }
  }

  private func label(for course: CourseItem) -> String {
    if course.startDate <= Date() && course.endDate > Date() {
      return "En cours"
    }
    return "Prochain cours"
  }
}

struct UpcomingCoursesWidgetView: View {
  let entry: CourseTimelineEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Prochains cours")
          .font(.headline.weight(.bold))
        Spacer()
        Text(updatedLabel)
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.secondary)
      }

      if entry.courses.isEmpty {
        Text("Aucun cours synchronise")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      } else {
        ForEach(Array(entry.courses.prefix(4).enumerated()), id: \.element.id) { index, course in
          CourseRow(course: course, active: index == 0)
        }
      }
    }
    .containerBackground(.fill.tertiary, for: .widget)
  }

  private var updatedLabel: String {
    guard let date = CourseWidgetData.updatedAt() else { return "Non synchronise" }
    return "Maj \(date.formatted(date: .omitted, time: .shortened))"
  }
}

struct CourseRow: View {
  let course: CourseItem
  let active: Bool

  var body: some View {
    HStack(spacing: 8) {
      RoundedRectangle(cornerRadius: 3)
        .fill(active ? course.accent : Color.secondary.opacity(0.25))
        .frame(width: 5)

      Text(course.startDate.formatted(date: .omitted, time: .shortened))
        .font(.caption.weight(.bold))
        .foregroundStyle(active ? course.accent : Color.secondary)
        .frame(width: 46, alignment: .leading)

      VStack(alignment: .leading, spacing: 2) {
        Text(course.title)
          .font(.caption.weight(.bold))
          .foregroundStyle(active ? Color.primary : Color.secondary)
          .lineLimit(1)
        Text("\(course.startDate.formatted(date: .abbreviated, time: .omitted)) · \(course.room)")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .padding(8)
    .background(active ? Color.white.opacity(0.7) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
  }
}

struct NextCourseWidget: Widget {
  let kind = "EpiTimeNextCourseWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CourseTimelineProvider()) { entry in
      NextCourseWidgetView(entry: entry)
    }
    .configurationDisplayName("Prochain cours")
    .description("Affiche le prochain cours EpiTime.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct UpcomingCoursesWidget: Widget {
  let kind = "EpiTimeUpcomingCoursesWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CourseTimelineProvider()) { entry in
      UpcomingCoursesWidgetView(entry: entry)
    }
    .configurationDisplayName("Prochains cours")
    .description("Affiche les prochains cours avec le plus proche en couleur.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

@main
struct EpiTimeWidgetBundle: WidgetBundle {
  var body: some Widget {
    NextCourseWidget()
    UpcomingCoursesWidget()
  }
}

private extension CourseItem {
  static let preview = CourseItem(
    idValue: "preview",
    title: "Cours Integre",
    type: "Cours",
    room: "KB 1",
    teacher: "",
    startMillis: Date().addingTimeInterval(25 * 60).timeIntervalSince1970 * 1000,
    endMillis: Date().addingTimeInterval(85 * 60).timeIntervalSince1970 * 1000,
    color: "#0EA5E9"
  )
}
