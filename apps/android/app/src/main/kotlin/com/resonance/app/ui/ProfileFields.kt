package com.resonance.app.ui

import android.icu.text.DisplayContext
import android.icu.text.LocaleDisplayNames
import android.icu.util.ULocale
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.FieldLabel
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicRadio
import com.resonance.design.SquareFlag
import com.resonance.design.hasSquareFlag
import com.resonance.design.OrganicTextField
import com.resonance.design.WavyDivider
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * A pen name as the contract takes it (`Handle` in lib/api/v1/schemas.ts):
 * trimmed, 2–20 characters in any script, but never / ? # \ (it is the
 * /u/{handle} path segment) nor a control character.
 */
object PenName {
    const val MIN = 2
    const val MAX = 20
    private const val FORBIDDEN = "/?#\\"

    private fun allowed(c: Char) = c !in FORBIDDEN && !c.isISOControl()

    /** What the field keeps of what was typed: no refused characters, at most [MAX] (the web's `slice(0, 20)`), no half an emoji. */
    fun sanitize(typed: String): String {
        val kept = typed.filter(::allowed).take(MAX)
        return if (kept.lastOrNull()?.isHighSurrogate() == true) kept.dropLast(1) else kept
    }

    fun isValid(name: String): Boolean = name.trim().let { t -> t.length in MIN..MAX && t.all(::allowed) }
}

/** Where a pen name stands while it is typed (the web's handleState), plus your own unchanged name and a failed check. */
enum class Availability { Idle, Own, Checking, Available, Taken, Failed }

/**
 * Checks the name as it is typed: 350ms after the last keystroke (the web's
 * debounce), GET /api/v1/handles/{handle}. A name too short or refused
 * locally is Idle; `own` (your current pen name, in settings) needs no
 * check. Bump `retry` to ask again after a failure. The state is writable so
 * a 409 on saving can mark the name taken.
 */
@Composable
fun rememberPenNameAvailability(session: Session, name: String, own: String? = null, retry: Int = 0): MutableState<Availability> {
    val state = remember { mutableStateOf(Availability.Idle) }
    val trimmed = name.trim()
    LaunchedEffect(trimmed, own, retry) {
        state.value = when {
            !PenName.isValid(trimmed) -> Availability.Idle
            trimmed == own -> Availability.Own
            else -> Availability.Checking
        }
        if (state.value != Availability.Checking) return@LaunchedEffect
        delay(350)
        state.value = try {
            if (session.profiles.isAvailable(trimmed)) Availability.Available else Availability.Taken
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Availability.Failed
        }
    }
    return state
}

/**
 * The pen-name field and, 6 under it, its standing: checking (muted), the
 * web's checkmark and "Available ✿" (sage), taken (terracotta), or — when
 * the check itself failed — the load error with a retry.
 */
@Composable
fun PenNameField(label: String, value: String, onValueChange: (String) -> Unit, availability: Availability, onRetry: () -> Unit, seed: Double = 31.0) {
    Column {
        OrganicTextField(label, value, { onValueChange(PenName.sanitize(it)) }, seed = seed)
        Row(
            // The line keeps its room, so the fields below don't jump as it comes and goes.
            Modifier.padding(top = 6.dp).heightIn(min = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            val small = 12f
            when (availability) {
                Availability.Checking -> BasicText(L10n.Auth.handleChecking, style = AppFonts.body(small, lineHeight = 1.4f, color = Tokens.TextMuted))
                Availability.Available -> {
                    OrganicIcon(IconName.Check, size = 12.dp, color = Tokens.Sage)
                    BasicText(L10n.Auth.handleAvailable, style = AppFonts.body(small, lineHeight = 1.4f, color = Tokens.Sage))
                }
                Availability.Taken -> BasicText(L10n.Auth.handleTaken, style = AppFonts.body(small, lineHeight = 1.4f, color = Tokens.Terracotta))
                Availability.Failed -> {
                    BasicText(L10n.Native.loadError, style = AppFonts.body(small, lineHeight = 1.4f, color = Tokens.TextMuted), modifier = Modifier.weight(1f, fill = false))
                    BasicText(
                        L10n.Native.retry,
                        style = AppFonts.body(small, 600, lineHeight = 1.4f, color = Tokens.Terracotta),
                        modifier = Modifier.plainClickable(role = Role.Button, onClick = onRetry).padding(start = 4.dp),
                    )
                }
                Availability.Idle, Availability.Own -> Unit
            }
        }
    }
}

/**
 * A short list to pick one from — the web's organic select as the app's
 * radio rows (settings' language list): the field's label, then each
 * choice beside its hand-drawn radio, between wavy rules.
 */
@Composable
fun <T> ChoiceList(
    label: String,
    options: List<Pair<T, String>>,
    selected: T,
    seed: Double,
    /** A choice's flag, as the web's settings set a SquareFlag before a region or a language. */
    flag: ((T) -> String?)? = null,
    onSelect: (T) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        FieldLabel(label)
        Column(Modifier.selectableGroup()) {
            options.forEachIndexed { i, (value, text) ->
                if (i > 0) WavyDivider(seed = seed + i * 6, modifier = Modifier.padding(vertical = 2.dp))
                val chosen = value == selected
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .semantics { this.selected = chosen }
                        .plainClickable(role = Role.RadioButton) { onSelect(value) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // A region without the web's art gets no gap either: its name lines up with the others' flags' edge.
                    flag?.invoke(value)?.takeIf(::hasSquareFlag)?.let { code ->
                        SquareFlag(code, 18.dp)
                        Spacer(Modifier.width(10.dp))
                    }
                    BasicText(
                        text,
                        style = AppFonts.body(15f, if (chosen) 600 else 400, color = if (chosen) Tokens.Terracotta else Tokens.Text),
                        modifier = Modifier.weight(1f),
                    )
                    OrganicRadio(chosen, seed + i * 7 + 3)
                }
            }
        }
    }
}

/** Regions a profile can name. */
object Regions {
    /** The signup step's regions, in the web's order (PROFILE_REGIONS in src/lib/regionName.ts). */
    private val codes = listOf("TW", "JP", "US", "KR", "HK")

    /** The signup step's options, named in the interface's language (the web's regionDisplayName). */
    val signup: List<Pair<String, String>> get() = codes.map { it to label(it) }

    /**
     * Settings' options: the same regions named in the interface's language
     * (the web's regionDisplayName), plus the profile's own when it is
     * another, so it is never silently replaced.
     */
    fun settings(current: String?): List<Pair<String, String>> {
        val all = codes + listOfNotNull(current?.takeIf { c -> c.isNotBlank() && c !in codes })
        return all.map { it to label(it) }
    }

    /** "TW" → "台灣" in the interface language (its SquareFlag is drawn beside it); free text stays as it is. */
    fun label(region: String): String {
        val code = code(region).takeIf { c -> c.length == 2 && c.all { it in 'A'..'Z' } } ?: return region
        return runCatching { displayName(code) }.getOrNull()?.takeIf { it.isNotBlank() } ?: code
    }

    /** The ISO code a stored region stands for: an older `UK` is `GB` (the web's regionCode). */
    fun code(region: String): String = region.trim().uppercase().let { if (it == "UK") "GB" else it }

    /** The region's SquareFlag code, or null when the app has no flag art for it (the web's squareFlagCode). */
    fun flagCode(region: String): String? = code(region).lowercase().takeIf { it.length == 2 && hasSquareFlag(it) }

    /**
     * The region's name; Hong Kong and Macau by their short one (香港, not the full
     * 中國香港特別行政區), as the web's regionDisplayName and Apple's names read.
     */
    private fun displayName(code: String): String {
        val locale = Strings.language.locale
        if (code in SHORT_NAMED) {
            LocaleDisplayNames.getInstance(ULocale.forLocale(locale), DisplayContext.LENGTH_SHORT).regionDisplayName(code)
                ?.takeIf { it.isNotBlank() && it != code }?.let { return it }
        }
        return Locale.Builder().setRegion(code).build().getDisplayCountry(locale)
    }

    private val SHORT_NAMED = setOf("HK", "MO")
}

/** The writing languages a profile can name, in the web's order and labels. */
val WritingLanguages = listOf("zh-TW" to "繁體中文", "en" to "English")
