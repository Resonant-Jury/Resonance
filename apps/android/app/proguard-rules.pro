# kotlinx.serialization (the generated API models)
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.resonance.api.models.** { *** Companion; }
-keepclasseswithmembers class com.resonance.api.models.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.resonance.api.models.**$$serializer { *; }
