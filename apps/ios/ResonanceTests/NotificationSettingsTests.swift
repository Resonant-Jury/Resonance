import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// Settings → 通知: two switches, both off until turned on. Turning one on asks the system first
/// (its question only when never asked); without a yes the switch stays off and the section says
/// where notifications are turned on. A flip shows at once and goes back, saying so, when the
/// server refuses it.
@MainActor @Suite struct NotificationSettingsTests {
    typealias Settings = NotificationSettingsAPI.Settings

    /// The system and the server, as the model meets them.
    @MainActor final class World {
        var permission: PushCenter.Permission = .allowed
        /// What the person answers the system's question.
        var answersYes = true
        var asked = 0
        var registered = 0
        var stored = Settings(picks: false, connectionCards: false)
        var readFails = false
        var saveFails = false
        /// Holds a save's answer back until the test opens it.
        var gate: Gate<Void>?
        var saves: [String] = []

        func read() throws -> Settings {
            if readFails { throw APIFailure.unexpected(status: 502) }
            return stored
        }

        func save(_ name: NotificationSettingsAPI.Switch, _ on: Bool) async throws -> Settings {
            saves.append("\(name.rawValue)=\(on)")
            if let gate { await gate.wait() }
            if saveFails { throw APIFailure.unexpected(status: 500) }
            stored[name] = on
            return stored
        }

        /// PushCenter.askIfUndetermined: the question only when never asked.
        func ask() -> Bool {
            guard permission == .undetermined else { return permission == .allowed }
            asked += 1
            permission = answersYes ? .allowed : .denied
            return answersYes
        }
    }

    func model(_ world: World) -> NotificationSettingsModel {
        NotificationSettingsModel(fetch: { try await world.read() }, save: { try await world.save($0, $1) },
                                  permission: { world.permission }, ask: { world.ask() }, register: { world.registered += 1 })
    }

    @Test func bothAreOffUntilTurnedOn() async {
        let world = World()
        let model = model(world)
        #expect(!model.canFlip)
        await model.load()
        #expect(model.canFlip)
        #expect(!model.isOn(.picks) && !model.isOn(.connectionCards))
        #expect(!model.permissionDenied && !model.loadFailed && !model.saveFailed)
    }

    @Test func aFlipShowsAtOnceAndSendsThatSwitch() async {
        let world = World()
        let model = model(world)
        await model.load()
        let gate = Gate<Void>()
        world.gate = gate
        let flip = Task { await model.set(.connectionCards, true) }
        // On before the server has answered; the other switch waits meanwhile.
        #expect(await eventually { model.isOn(.connectionCards) && model.pending == .connectionCards })
        #expect(!model.canFlip)
        await gate.open(())
        await flip.value
        #expect(world.saves == ["connectionCards=true"])
        #expect(model.isOn(.connectionCards) && !model.isOn(.picks))
        #expect(model.pending == nil && model.canFlip && !model.saveFailed)
        // Already allowed: no question.
        #expect(world.asked == 0)
    }

    @Test func aFlipThatDoesNotSaveGoesBackAndSaysSo() async {
        let world = World()
        let model = model(world)
        await model.load()
        world.saveFails = true
        await model.set(.picks, true)
        #expect(!model.isOn(.picks))
        #expect(model.saveFailed)

        // Trying again, and it saves: the line goes.
        world.saveFails = false
        await model.set(.picks, true)
        #expect(model.isOn(.picks) && !model.saveFailed)

        // Off again, refused: back on.
        world.saveFails = true
        await model.set(.picks, false)
        #expect(model.isOn(.picks) && model.saveFailed)
    }

    @Test func turningOneOnWhenNeverAskedAsksTheSystemFirst() async {
        let world = World()
        world.permission = .undetermined
        let model = model(world)
        await model.load()
        #expect(model.permission == .undetermined && !model.permissionDenied)
        await model.set(.picks, true)
        #expect(world.asked == 1)
        #expect(model.permission == .allowed)
        #expect(world.saves == ["picks=true"])
        #expect(model.isOn(.picks) && !model.permissionDenied)
    }

    @Test func aNoToTheSystemsQuestionLeavesTheSwitchOff() async {
        let world = World()
        world.permission = .undetermined
        world.answersYes = false
        let model = model(world)
        await model.load()
        await model.set(.picks, true)
        #expect(world.asked == 1)
        #expect(!model.isOn(.picks))
        #expect(world.saves.isEmpty)
        // The way to Settings, since the app can't ask again.
        #expect(model.permission == .denied && model.permissionDenied)
        #expect(!model.saveFailed && model.canFlip)
    }

    @Test func turnedOffInSettingsTheSwitchStaysOffUntilTurnedOnThere() async {
        let world = World()
        world.permission = .denied
        let model = model(world)
        await model.load()
        // Both off: nothing to warn about yet.
        #expect(!model.permissionDenied)
        await model.set(.connectionCards, true)
        #expect(world.asked == 0)
        #expect(!model.isOn(.connectionCards) && world.saves.isEmpty)
        #expect(model.permissionDenied)

        // Turned on in Settings, and back: the line goes, the install registers, the switch turns on.
        world.permission = .allowed
        await model.checkPermission()
        #expect(!model.permissionDenied)
        #expect(world.registered == 1)
        await model.set(.connectionCards, true)
        #expect(model.isOn(.connectionCards) && world.saves == ["connectionCards=true"])
        // Looking again changes nothing more.
        await model.checkPermission()
        #expect(world.registered == 1)
    }

    @Test func aSwitchOnWhileTheSystemSaysNoIsShownWithTheWayToSettings() async {
        let world = World()
        world.permission = .denied
        world.stored = Settings(picks: true, connectionCards: false)
        let model = model(world)
        await model.load()
        // Turned on elsewhere (the web, another phone): nothing it asks for can show here.
        #expect(model.isOn(.picks) && model.permissionDenied)
        // Turning it off never asks.
        await model.set(.picks, false)
        #expect(world.asked == 0 && world.saves == ["picks=false"])
        #expect(!model.isOn(.picks) && !model.permissionDenied)
    }

    @Test func aFailedReadSaysSoAndNothingCanBeFlipped() async {
        let world = World()
        world.readFails = true
        let model = model(world)
        await model.load()
        #expect(model.loadFailed && !model.canFlip)
        await model.set(.picks, true)
        #expect(world.saves.isEmpty && !model.isOn(.picks))

        world.readFails = false
        await model.load()
        #expect(!model.loadFailed && model.canFlip)

        // Read again behind switches on screen, and it fails: they stay.
        world.readFails = true
        await model.load()
        #expect(!model.loadFailed && model.canFlip)
    }

    @Test func theSectionIsTheWebsWithItsBell() {
        // Its place in the list: PolicyPageTests.settingsListKeepsTheWebsOrderAndRuleSeeds.
        #expect(SettingsSection.notifications.icon == .bell)
        #expect(SettingsSection.notifications.title == L10n.Settings.Sections.notifications)
    }
}
