#include "RitoExecutor.h"

#include <utility>

namespace ritojs::reactnative {

RitoExecutor::RitoExecutor(std::size_t maximumQueueDepth)
    : maximumQueueDepth_(maximumQueueDepth), thread_([this] { run(); }) {}

RitoExecutor::~RitoExecutor() {
  close();
}

bool RitoExecutor::submit(std::function<void()> task) {
  {
    std::lock_guard lock(mutex_);
    if (closing_ || tasks_.size() >= maximumQueueDepth_) {
      return false;
    }
    tasks_.push(std::move(task));
  }
  condition_.notify_one();
  return true;
}

void RitoExecutor::close() {
  {
    std::lock_guard lock(mutex_);
    if (closing_) {
      return;
    }
    closing_ = true;
  }
  condition_.notify_all();
  if (thread_.joinable()) {
    thread_.join();
  }
}

void RitoExecutor::run() {
  for (;;) {
    std::function<void()> task;
    {
      std::unique_lock lock(mutex_);
      condition_.wait(lock, [this] { return closing_ || !tasks_.empty(); });
      if (tasks_.empty()) {
        return;
      }
      task = std::move(tasks_.front());
      tasks_.pop();
    }
    task();
  }
}

}  // namespace ritojs::reactnative
