// XN01 and XN02 execute within ORIGINAL Mundo X / Inverse Ether Memory.
#include "mundo_x/quantum_runtime.hpp"
#include "laplace_temporal.hpp"
#include <jni.h>
#include <exception>
#include <stdexcept>
#include <string>
namespace {
void fail(JNIEnv* env,const char* message){
  auto cls=env->FindClass("java/lang/IllegalStateException");
  if(cls)env->ThrowNew(cls,message);
}
}
namespace {
std::string bounded(JNIEnv* env,jstring input,jsize maximum){
  if(!input||env->GetStringUTFLength(input)>maximum)throw std::length_error("LQT: JNI input exceeds limit");
  const char* value=env->GetStringUTFChars(input,nullptr);
  if(!value)throw std::runtime_error("LQT: JNI UTF8 unavailable");
  std::string out(value);env->ReleaseStringUTFChars(input,value);return out;
}
}
extern "C" JNIEXPORT jstring JNICALL
Java_com_entidadlaplace_mobile_NativeQuantumTemporal_executeProgram(JNIEnv* env,jclass,jstring program,jstring checkpoint){
  try{
    auto source=bounded(env,program,2*1024*1024),saved=bounded(env,checkpoint,256*1024);
    mundo_x::laplace::TemporalXiRuntime runtime;auto output=runtime.execute(source,saved);
    if(output.size()>1048576)throw std::length_error("LQT: native output exceeds limit");
    return env->NewStringUTF(output.c_str());
  }catch(const std::exception& error){fail(env,error.what());return nullptr;}
}
extern "C" JNIEXPORT void JNICALL
Java_com_entidadlaplace_mobile_NativeQuantumTemporal_validateCheckpoint(JNIEnv* env,jclass,jstring checkpoint,jstring asset,jint g,jint minutes,jboolean equity,jlong asof){
  try{
    auto saved=bounded(env,checkpoint,256*1024),symbol=bounded(env,asset,32);
    mundo_x::laplace::require(minutes>0&&minutes<=129600&&g>0&&minutes*60LL%g==0,"LQT: checkpoint resolution");
    mundo_x::laplace::Config c;c.asset=symbol;c.granularity=g;c.horizon=minutes*60/g;c.equity=equity;c.asof=double(asof);
    mundo_x::laplace::Model::restore(saved,c,true);
  }catch(const std::exception& error){fail(env,error.what());}
}
extern "C" JNIEXPORT jstring JNICALL
Java_com_entidadlaplace_mobile_NativeXN01_executeProgram(JNIEnv* env,jclass,jstring input){
  try{
    if(!input)throw std::invalid_argument("XI program missing");
    const jsize size=env->GetStringUTFLength(input);
    if(size<=0||size>512*1024)throw std::length_error("XI program outside transport limit");
    const char* u=env->GetStringUTFChars(input,nullptr);
    if(!u)throw std::runtime_error("JNI UTF8 unavailable");
    const std::string source(u,std::size_t(size));
    env->ReleaseStringUTFChars(input,u);
    // Fresh isolated memory, no desktop checkpoint mutation.
    mundo_x::QuantumRuntime runtime;
    const std::string output=runtime.execute(source);
    if(output.size()>1048576)throw std::length_error("Native output exceeds 1 MiB");
    return env->NewStringUTF(output.c_str());
  }catch(const std::exception& error){fail(env,error.what());return nullptr;}
}
